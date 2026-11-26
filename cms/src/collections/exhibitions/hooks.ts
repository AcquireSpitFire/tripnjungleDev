// Hooks of the exhibitions (src/collections/Exhibitions.ts), in the order they run on a save:
//
//   beforeChange  keepPrintsWithTheirPhoto  only managers replace the photo of an item with prints
//                 artistCreatesPlanned      an artist's new exhibition: own profile, planning, locked
//                 deriveVisibility          visibility, release and the derived "locked" flag
//                 appendBulkUploads         "Add several photos at once" → new gallery items
//                 checkAddedMedia           artists/editors only add public media or their own uploads
//   afterRead     withDerivedValues         old entries get visibility/release
//   afterChange   syncMediaAfterChange      lock/sale state of the media used before and after
//   afterDelete   syncMediaAfterDelete      the same for a deleted exhibition
import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionAfterReadHook,
  type CollectionBeforeChangeHook,
} from 'payload'

import { canManageExhibitions, clearAccessCache, getArtistProfileId, isArtist } from '../../access/roles'
import { assertMediaMayBeAdded, mediaIdsOf, syncMediaLocks } from '../../lib/media-lock'
import { getRelease, getVisibility, toId, type Ref } from '../../lib/visibility'

type GalleryRow = { id?: string | null; file?: Ref; name?: string | null; alt?: string | null; prints?: unknown[] | null }

// A print belongs to its photo. Artists and editors cannot change prints, but by putting another
// file into a row that has prints they could sell them with a different photo: only managers may
// replace the file of such a row (a new photo can always be added as a new row).
export const keepPrintsWithTheirPhoto: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (canManageExhibitions(req.user) || !Array.isArray(data.gallery) || !originalDoc?.gallery) {
    return data
  }

  const before = new Map((originalDoc.gallery as GalleryRow[]).map((row) => [String(row.id), row]))
  const replaced = (data.gallery as GalleryRow[]).some((row) => {
    const old = row.id ? before.get(String(row.id)) : undefined

    return Boolean(old?.prints?.length) && String(toId(row.file)) !== String(toId(old?.file))
  })

  if (replaced) {
    throw new ValidationError({
      collection: 'exhibitions',
      errors: [
        {
          path: 'gallery',
          message: 'This item has prints: only a manager can replace its photo. Add the new photo as a new item instead.',
        },
      ],
    })
  }

  return data
}

// An artist creates: credited to their own profile, nothing goes public without a manager
export const artistCreatesPlanned: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create' && !canManageExhibitions(req.user) && isArtist(req.user)) {
    data.artists = [getArtistProfileId(req.user)]
    data.release = 'planning'
    data.visibility = 'locked'
  }

  return data
}

// Partial updates lack fields in data; then the stored state applies
export const deriveVisibility: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const visibility = getVisibility({
    visibility: data.visibility ?? originalDoc?.visibility,
    locked: data.locked ?? originalDoc?.locked,
  })

  data.visibility = visibility
  data.release = data.release ?? originalDoc?.release ?? 'scheduled'
  data.locked = visibility !== 'public'

  return data
}

// Bulk upload: append the files as new rows to "gallery", then empty the field
export const appendBulkUploads: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const bulk = ((data.bulkMedia as Ref[] | undefined) || []).map(toId).filter((id): id is number | string => id !== null)

  if (bulk.length) {
    const rows: GalleryRow[] = [...(data.gallery ?? originalDoc?.gallery ?? [])]
    const present = new Set(rows.map((row) => String(toId(row.file))))

    for (const id of bulk) {
      if (!present.has(String(id))) {
        // Copy the alt text entered in the upload dialog into the row
        const media = await req.payload.findByID({ collection: 'media', id, depth: 0, req, overrideAccess: true }).catch(() => null)

        rows.push({ file: id, name: '', alt: media?.alt || '' })
        present.add(String(id))
      }
    }

    data.gallery = rows
  }

  data.bulkMedia = []

  return data
}

// Artists/editors may only add media that are public already or their own uploads (see
// assertMediaMayBeAdded). Posters and content are compared separately: posters are public sooner
// (outside "planning"), so a locked gallery photo must not become a poster either.
export const checkAddedMedia: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const posters = (data.posters ?? originalDoc?.posters) as Ref[] | undefined
  const content = {
    frontPage: 'frontPage' in data ? data.frontPage : originalDoc?.frontPage,
    gallery: data.gallery ?? originalDoc?.gallery,
  }

  await assertMediaMayBeAdded(req, mediaIdsOf({ posters }), mediaIdsOf({ posters: originalDoc?.posters }), 'exhibitions')
  await assertMediaMayBeAdded(
    req,
    mediaIdsOf(content),
    mediaIdsOf({ frontPage: originalDoc?.frontPage, gallery: originalDoc?.gallery }),
    'exhibitions',
  )

  return data
}

// Deliver old entries (columns still empty) with derived values
export const withDerivedValues: CollectionAfterReadHook = ({ doc }) => {
  doc.visibility = getVisibility(doc)
  doc.release = getRelease(doc)

  return doc
}

// Media used now and media removed by this change: both may change their lock state
export const syncMediaAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  clearAccessCache(req)
  await syncMediaLocks(req, [...mediaIdsOf(doc), ...mediaIdsOf(previousDoc)])

  return doc
}

// The deleted exhibition no longer counts: its media are locked unless used elsewhere
export const syncMediaAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  clearAccessCache(req)
  await syncMediaLocks(req, mediaIdsOf(doc))

  return doc
}
