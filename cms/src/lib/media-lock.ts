// Keeps the "locked" flag of media in sync with the exhibitions that use them – and "forSale"
// and "watermarkKey" (see saleState below and src/lib/watermark.ts).
//
// A medium is public (locked: false) as soon as ANY exhibition makes it public:
//   - as a poster of an exhibition that is not in "planning"
//   - as cover or gallery item of an exhibition whose content is open
//     (public or locked with link, not in planning)
// or as the portrait of an artist profile.
// Otherwise it is locked. Without login the API and the file route only
// deliver media with locked: false (see src/collections/Media.ts).
//
// Computing it from all exhibitions (instead of only the one just saved) means
// that using the same image in two exhibitions, or removing an image from an
// exhibition, always ends in the right state.
import { ValidationError, type PayloadRequest } from 'payload'

import { canManageExhibitions, getUserId } from '../access/roles'
import type { Exhibition, Media } from '../payload-types'
import { isOffered, isSellableMedia } from './shop/catalog'
import { contentIsOpen, getRelease, toId, type Ref } from './visibility'
import { watermarkKey, watermarkSettings, watermarkSourceId } from './watermark'

type ExhibitionMedia = {
  posters?: Ref[] | null
  frontPage?: Ref
  gallery?: { file?: Ref }[] | null
}

type Id = number | string

// All media ids an exhibition refers to
export function mediaIdsOf(doc: ExhibitionMedia | null | undefined): Id[] {
  if (!doc) {
    return []
  }

  return [...(doc.posters || []), doc.frontPage, ...(doc.gallery || []).map((row) => row.file)]
    .map(toId)
    .filter((id): id is Id => id !== null)
}

// Accounts without the right to publish (artists, editors) must not be able to make a
// locked medium public by placing it somewhere public: as a poster, as cover or gallery item
// of an open exhibition, or as an artist portrait. Media they ADD therefore have to be
// public already or their own upload. Media that were in the document before are not
// checked, so saving or reordering an existing exhibition keeps working.
export async function assertMediaMayBeAdded(
  req: PayloadRequest,
  nextIds: Id[],
  previousIds: Id[],
  collection: 'exhibitions' | 'artists',
): Promise<void> {
  if (canManageExhibitions(req.user)) {
    return
  }

  const before = new Set(previousIds.map(String))
  const added = [...new Set(nextIds.map(String))].filter((id) => !before.has(id))

  if (!added.length) {
    return
  }

  const userId = getUserId(req.user)
  const { docs } = await req.payload.find({
    collection: 'media',
    where: { id: { in: added } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const blocked = docs.filter(
    (medium) => medium.locked !== false && (userId === null || String(toId(medium.createdBy)) !== String(userId)),
  )

  if (blocked.length || docs.length < added.length) {
    throw new ValidationError({
      collection,
      errors: [
        {
          path: collection === 'artists' ? 'portrait' : 'gallery',
          message:
            'You can only add photos that are already public or that you uploaded yourself. Ask a manager to add the others.',
        },
      ],
    })
  }
}

export async function syncMediaLocks(req: PayloadRequest, mediaIds: Iterable<Id>): Promise<void> {
  const ids = [...new Set([...mediaIds].map(String))]

  if (!ids.length) {
    return
  }

  const { docs: exhibitions } = await req.payload.find({
    collection: 'exhibitions',
    where: {
      or: [{ posters: { in: ids } }, { frontPage: { in: ids } }, { 'gallery.file': { in: ids } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const open = new Set<string>()

  for (const exhibition of exhibitions) {
    if (getRelease(exhibition) !== 'planning') {
      for (const poster of exhibition.posters || []) {
        const id = toId(poster)

        if (id !== null) {
          open.add(String(id))
        }
      }
    }

    if (contentIsOpen(exhibition)) {
      for (const ref of [exhibition.frontPage, ...(exhibition.gallery || []).map((row) => row.file)]) {
        const id = toId(ref)

        if (id !== null) {
          open.add(String(id))
        }
      }
    }
  }

  const { docs: artists } = await req.payload.find({
    collection: 'artists',
    where: { portrait: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  for (const artist of artists) {
    const id = toId(artist.portrait)

    if (id !== null) {
      open.add(String(id))
    }
  }

  const { docs: media } = await req.payload.find({
    collection: 'media',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const sale = await saleState(req, exhibitions)

  for (const medium of media) {
    const locked = !open.has(String(medium.id))
    const forSale = sale.forSale.has(String(medium.id)) && isSellableMedia(medium)
    const watermarkKey = forSale ? sale.keyFor(medium) : ''

    if (medium.locked !== locked || Boolean(medium.forSale) !== forSale || (medium.watermarkKey || '') !== watermarkKey) {
      await req.payload.update({
        collection: 'media',
        id: medium.id,
        data: { locked, forSale, watermarkKey },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }
  }
}

// Which media are for sale (some exhibition offers a print of them, src/lib/shop/catalog.ts) and
// the watermark key of each one (the watermark image follows watermarkSourceId in src/lib/watermark.ts)
async function saleState(
  req: PayloadRequest,
  exhibitions: Pick<Exhibition, 'id' | 'gallery' | 'watermark'>[],
): Promise<{ forSale: Set<string>; keyFor: (medium: Media) => string }> {
  const forSale = new Set<string>()

  for (const exhibition of exhibitions) {
    for (const row of exhibition.gallery || []) {
      const id = toId(row.file)

      if (id !== null && (row.prints || []).some(isOffered)) {
        forSale.add(String(id))
      }
    }
  }

  if (!forSale.size) {
    return { forSale, keyFor: () => '' }
  }

  const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })
  const settings = watermarkSettings(site)
  const sourceOf = new Map([...forSale].map((id) => [id, watermarkSourceId(id, exhibitions, site.watermarkImage)]))
  const sourceIds = [...new Set([...sourceOf.values()].filter((id) => id !== null).map(String))]
  const { docs: sources } = sourceIds.length
    ? await req.payload.find({
        collection: 'media',
        where: { id: { in: sourceIds } },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
    : { docs: [] as Media[] }
  const sourceById = new Map(sources.map((source) => [String(source.id), source]))

  return {
    forSale,
    keyFor: (medium) => {
      const sourceId = sourceOf.get(String(medium.id))
      const source = sourceId === null || sourceId === undefined ? null : sourceById.get(String(sourceId)) || null

      return watermarkKey(medium, source, settings)
    },
  }
}
