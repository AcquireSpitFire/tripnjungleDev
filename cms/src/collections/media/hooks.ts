// Hooks of the media (src/collections/Media.ts):
//
//   beforeOperation  stripMetadataOfSmallImages  small images are saved without EXIF data
//   beforeChange     requireRightsConfirmation   new files only with accepted terms + "Rights confirmed"
//   afterRead        watermarkedUrlsForVisitors  photos for sale: visitors get /media-wm/… URLs
//   afterChange      resyncAfterReupload         a new file gives new watermark keys
//   afterDelete      removeWatermarkCopies       the watermarked copies go with the medium
import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionAfterReadHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type PayloadRequest,
} from 'payload'
import sharp, { type Sharp } from 'sharp'

import { assertTermsAccepted, mustAcceptTerms } from '../../lib/contributor-terms'
import { syncMediaLocks } from '../../lib/media-lock'
import { serverUrl } from '../../lib/site-identity'
import {
  WATERMARK_SIZES,
  removeWatermarkedFiles,
  watermarkFileName,
  type WatermarkSize,
} from '../../lib/watermark'
import { watermarkImageIds } from './access'

// Width of the smallest generated size ("thumb"), longest side of the next one ("medium")
const THUMB_WIDTH = 600
const LARGEST_UNRESIZED_SIDE = 1280

// Same format as uploaded; sharp writes no metadata unless asked to
const REENCODE: Record<string, (image: Sharp) => Sharp> = {
  'image/jpeg': (image) => image.jpeg({ quality: 90 }),
  'image/png': (image) => image.png(),
  'image/webp': (image) => image.webp({ quality: 90 }),
  'image/avif': (image) => image.avif({ quality: 90 }),
}

// Images too small for any generated size are delivered to visitors as the original file.
// Those originals are saved again without metadata (EXIF: GPS position, time, camera serial),
// turned upright first. Larger originals stay untouched (print quality) and only reach
// logged-in accounts (hideFilesFromVisitors). GIFs are kept (animation).
export const stripMetadataOfSmallImages: CollectionBeforeOperationHook = async ({
  args,
  operation,
}) => {
  const file = (args as { req?: PayloadRequest }).req?.file
  const reencode = file ? REENCODE[file.mimetype] : undefined

  if ((operation !== 'create' && operation !== 'update') || !file?.data?.length || !reencode) {
    return args
  }

  const { width = 0, height = 0, orientation = 1 } = await sharp(file.data).metadata()
  // Orientations 5–8 are turned by 90°: width and height swap
  const uprightWidth = orientation >= 5 ? height : width

  if (uprightWidth > THUMB_WIDTH || Math.max(width, height) > LARGEST_UNRESIZED_SIDE) {
    return args
  }

  const data = await reencode(sharp(file.data).rotate()).toBuffer()

  file.data = data
  file.size = data.length

  return args
}

// Uploading a new file (also replacing one) only after accepting the contributor terms and with
// the rights confirmed for this file (not needed for admins). Updates without a file (alt text,
// the lock sync) are not affected, and the confirmation cannot be changed afterwards.
export const requireRightsConfirmation: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'create' && !req.file) {
    data.rightsConfirmed = originalDoc?.rightsConfirmed ?? false
    return data
  }

  await assertTermsAccepted(req)

  if (mustAcceptTerms(req.user)) {
    if (data.rightsConfirmed !== true) {
      throw new ValidationError({
        collection: 'media',
        errors: [
          {
            path: 'rightsConfirmed',
            message:
              'Please confirm that you hold all rights to this file (“Rights confirmed”). Several files at once: “Edit all” → “Rights confirmed”.',
          },
        ],
      })
    }

    const account = req.user as unknown as { id: number | string; email?: string }

    data.rightsConfirmedAt = new Date().toISOString()
    data.rightsConfirmedBy = `${account.email || 'unknown'} (account ${account.id})`
  }

  return data
}

// Photos for sale: visitors only get the watermarked copies (src/lib/watermark.ts). Every URL of
// the medium points to /media-wm/…, so the site, the SEO data and Stripe use them without knowing
// about it. Logged-in accounts (admin, preview) keep the plain files.
export const watermarkedUrlsForVisitors: CollectionAfterReadHook = ({ doc, req }) => {
  if (req.user || !doc?.forSale || !doc.watermarkKey) {
    return doc
  }

  const base = serverUrl()
  const url = (size: WatermarkSize) =>
    `${base}/media-wm/${watermarkFileName(doc.id, doc.watermarkKey, size)}`
  const sizes = { ...(doc.sizes || {}) } as Record<
    string,
    { url?: string | null; filename?: string | null } | null
  >
  let largest: WatermarkSize = 'large'

  for (const size of WATERMARK_SIZES) {
    if (sizes[size]?.filename) {
      sizes[size] = { ...sizes[size], url: url(size) }
      largest = size
    }
  }

  return { ...doc, url: url(largest), thumbnailURL: url('thumb'), sizes }
}

// A new file (re-upload): a new watermark key for this photo – and for all photos for sale if it
// is used as a watermark
export const resyncAfterReupload: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (
    operation !== 'update' ||
    (doc.filename === previousDoc?.filename && doc.filesize === previousDoc?.filesize)
  ) {
    return doc
  }

  const isWatermark = (await watermarkImageIds(req)).some((id) => String(id) === String(doc.id))
  const ids = isWatermark
    ? (
        await req.payload.find({
          collection: 'media',
          where: { forSale: { equals: true } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          select: {},
          req,
        })
      ).docs.map((medium) => medium.id)
    : doc.forSale
      ? [doc.id]
      : []

  await syncMediaLocks(req, ids)

  return doc
}

export const removeWatermarkCopies: CollectionAfterDeleteHook = ({ doc }) => {
  removeWatermarkedFiles(doc.id)
}
