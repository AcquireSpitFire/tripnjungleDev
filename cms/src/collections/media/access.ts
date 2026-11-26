// Who may read, change and download media (src/collections/Media.ts).
import type { AccessResult, PayloadRequest, Where } from 'payload'

import { canManageExhibitions, getAccessibleMediaIds, getRole, getUserId } from '../../access/roles'
import { toId } from '../../lib/visibility'

type Id = number | string

// GET /api/media or /api/media/<id> (not the file route /api/media/file/…)
function isDirectMediaApiRequest(req: PayloadRequest): boolean {
  const apiRoute = req.payload.config.routes.api || '/api'
  const path = req.pathname || ''

  return path.startsWith(`${apiRoute}/media`) && !path.startsWith(`${apiRoute}/media/file/`)
}

// Managers: everything. Artists/editors: public media, their own uploads and the media of their
// exhibitions. Visitors: public media, embedded in exhibitions/artists – /api/media itself is not
// public, so nobody can browse all public files at once.
export async function readMedia({ req }: { req: PayloadRequest }): Promise<AccessResult> {
  if (canManageExhibitions(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  if (!getRole(req.user) || userId === null) {
    return isDirectMediaApiRequest(req) ? false : { locked: { equals: false } }
  }

  const conditions: Where[] = [{ locked: { equals: false } }, { createdBy: { equals: userId } }]
  const ids = await getAccessibleMediaIds(req)

  if (ids.length) {
    conditions.push({ id: { in: ids } })
  }

  return { or: conditions }
}

// Images used as a watermark (Site settings → Shop, or the watermark of an exhibition)
export async function watermarkImageIds(req: PayloadRequest): Promise<Id[]> {
  const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })
  const { docs } = await req.payload.find({
    collection: 'exhibitions',
    where: { watermark: { exists: true } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { watermark: true },
    req,
  })

  return [site.watermarkImage, ...docs.map((exhibition) => exhibition.watermark)]
    .map(toId)
    .filter((id): id is Id => id !== null)
}

// Change and delete: managers everything; artists/editors only their own uploads while they are
// still locked (once published, only managers replace or delete them) and never a watermark
// image – replacing that file would change the watermark on every photo for sale.
export async function changeMedia({ req }: { req: PayloadRequest }): Promise<AccessResult> {
  if (canManageExhibitions(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  if (!getRole(req.user) || userId === null) {
    return false
  }

  const watermarks = await watermarkImageIds(req)

  return {
    and: [
      { createdBy: { equals: userId } },
      { locked: { equals: true } },
      ...(watermarks.length ? [{ id: { not_in: watermarks } }] : []),
    ],
  }
}

type MediaFileDoc = {
  filename?: string | null
  mimeType?: string | null
  forSale?: boolean | null
  sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

// The original of a photo that has generated sizes (it still carries the camera metadata)
function isProtectedOriginal(doc: MediaFileDoc, filename: string): boolean {
  const mimeType = doc.mimeType || ''

  if (!mimeType.startsWith('image/') || mimeType === 'image/gif' || filename !== doc.filename) {
    return false
  }

  return Object.values(doc.sizes || {}).some((size) => Boolean(size?.filename))
}

const notFound = () =>
  Response.json({ errors: [{ message: 'Not found.' }] }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

// Upload handler of the file route /api/media/file/<name>, after its read access check (locked
// media are 403 already). Visitors never get the files of a photo for sale (they get the
// watermarked copies, /media-wm/…) nor an original photo (EXIF/GPS); they get the generated sizes.
export function hideFilesFromVisitors(req: PayloadRequest, { doc, params }: { doc: unknown; params: { filename: string } }) {
  if (req.user) {
    return undefined
  }

  const file = doc as MediaFileDoc

  if (file.forSale || isProtectedOriginal(file, params.filename)) {
    return notFound()
  }

  return undefined
}
