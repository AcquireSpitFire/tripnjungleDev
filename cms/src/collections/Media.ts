import {
  ValidationError,
  type AccessResult,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
  type PayloadRequest,
  type Where,
} from 'payload'
import sharp, { type Sharp } from 'sharp'

import {
  canManageExhibitions,
  getAccessibleMediaIds,
  getRole,
  getUserId,
  loggedInField,
} from '../access/roles'
import { serverOnly } from '../fields/server-only'
import { auditFields, auditHook } from '../lib/audit'
import { assertTermsAccepted, mustAcceptTerms } from '../lib/contributor-terms'
import { syncMediaLocks } from '../lib/media-lock'
import { limitPublicQueries } from '../lib/query-limits'
import { serverUrl } from '../lib/site-identity'
import { toId } from '../lib/visibility'
import { WATERMARK_SIZES, removeWatermarkedFiles, watermarkFileName, type WatermarkSize } from '../lib/watermark'

// Images, videos and posters.
//
// On upload three WebP sizes are created (the original is kept):
//   thumb   600 px wide             admin, cards, phones
//   medium  1280 px longest side    slideshow, gallery, posters in lists
//   large   2560 px longest side    fullscreen, poster above the slideshow (4K desktop)
// Smaller originals are never enlarged.
//
// "locked" is not set by hand but by src/lib/media-lock.ts: a medium is public
// as soon as any exhibition makes it public (poster outside "planning", cover or
// gallery item of an exhibition that is public or locked with link).
// Without login the API (and the file route /api/media/file/…) only
// returns media with locked: false. New uploads are locked until an
// exhibition uses them.
//
// Accounts: managers see and change all media. Artists and editors see public
// media, their own uploads and the media of their exhibitions; they can only
// change or delete their own uploads ("createdBy"), and only while these are still
// locked – once a manager has published a photo, only managers can replace or delete it.
//
// Visitors:
//   - Original photos are only delivered to logged-in accounts: they still carry the
//     camera metadata (EXIF: GPS position, time, camera serial). Visitors get the
//     generated WebP sizes, which never contain metadata. Videos, GIFs and images
//     without generated sizes (very small files) keep their original; those small images are
//     saved without metadata on upload (stripMetadataOfSmallImages).
//   - The upload confirmation ("Rights confirmed …", with the uploader's e-mail) is only
//     readable for logged-in accounts.
//   - /api/media itself (list and single documents) is not public: the site only gets media
//     embedded in exhibitions and artists, so nobody can browse all public files at once.
//
// Watermark images (Site settings → Shop, or the watermark of an exhibition) are only changed by
// managers, even when they are somebody's own locked upload: replacing the file would change the
// watermark on every photo for sale.
async function watermarkImageIds(req: PayloadRequest): Promise<(number | string)[]> {
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
    .filter((id): id is number | string => id !== null)
}

async function ownLockedUploadsOrManager(req: PayloadRequest): Promise<boolean | Where> {
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
  sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

function isProtectedOriginal(doc: MediaFileDoc, filename: string): boolean {
  const mimeType = doc.mimeType || ''

  if (!mimeType.startsWith('image/') || mimeType === 'image/gif' || filename !== doc.filename) {
    return false
  }

  return Object.values(doc.sizes || {}).some((size) => Boolean(size?.filename))
}

// Width of the smallest generated size ("thumb" below)
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
// logged-in accounts (isProtectedOriginal). GIFs are kept (animation).
const stripMetadataOfSmallImages: CollectionBeforeOperationHook = async ({ args, operation }) => {
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

// GET /api/media or /api/media/<id> (not the file route /api/media/file/…)
function isDirectMediaApiRequest(req: PayloadRequest): boolean {
  const apiRoute = req.payload.config.routes.api || '/api'
  const path = req.pathname || ''

  return path.startsWith(`${apiRoute}/media`) && !path.startsWith(`${apiRoute}/media/file/`)
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Medium',
    plural: 'Media',
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'name', 'locked', 'updatedAt'],
  },
  access: {
    read: async ({ req }): Promise<AccessResult> => {
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
    },
    create: ({ req }) => Boolean(getRole(req.user)),
    update: ({ req }) => ownLockedUploadsOrManager(req),
    delete: ({ req }) => ownLockedUploadsOrManager(req),
  },
  hooks: {
    // Page size for visitors/artists/editors at most 100 (src/lib/query-limits.ts)
    beforeOperation: [limitPublicQueries, stripMetadataOfSmallImages],
    beforeChange: [
      // Uploading a new file (also replacing one) only after accepting the contributor terms and
      // with the rights confirmed for this file. Updates without a file (alt text, the lock sync)
      // are not affected, and the confirmation cannot be changed afterwards.
      async ({ data, operation, originalDoc, req }) => {
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
      },
      auditHook({ updatedBy: false }),
    ],
    // Photos for sale: visitors only get the watermarked copies (src/lib/watermark.ts). Every
    // URL of the medium points to /media-wm/…, so the site, the SEO data and Stripe use them
    // without knowing about it. Logged-in accounts (admin, preview) keep the plain files.
    afterRead: [
      ({ doc, req }) => {
        if (req.user || !doc?.forSale || !doc.watermarkKey) {
          return doc
        }

        const base = serverUrl()
        const url = (size: WatermarkSize) => `${base}/media-wm/${watermarkFileName(doc.id, doc.watermarkKey, size)}`
        const sizes = { ...(doc.sizes || {}) } as Record<string, { url?: string | null; filename?: string | null } | null>
        let largest: WatermarkSize = 'large'

        for (const size of WATERMARK_SIZES) {
          if (sizes[size]?.filename) {
            sizes[size] = { ...sizes[size], url: url(size) }
            largest = size
          }
        }

        return { ...doc, url: url(largest), thumbnailURL: url('thumb'), sizes }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // A new file (re-upload): new watermark key for this photo, and for all photos for sale
        // if it is used as a watermark
        if (operation !== 'update' || (doc.filename === previousDoc?.filename && doc.filesize === previousDoc?.filesize)) {
          return doc
        }

        const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })
        const { totalDocs: usedByExhibitions } = await req.payload.count({
          collection: 'exhibitions',
          where: { watermark: { equals: doc.id } },
          overrideAccess: true,
          req,
        })
        const isWatermark = String(toId(site.watermarkImage)) === String(doc.id) || usedByExhibitions > 0
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
      },
    ],
    afterDelete: [
      ({ doc }) => {
        removeWatermarkedFiles(doc.id)
      },
    ],
  },
  upload: {
    // Where the files are stored; when hosting, point it at a persistent volume (MEDIA_DIR)
    staticDir: process.env.MEDIA_DIR || 'media',
    // Files only from the own computer, no "paste URL": the server would otherwise fetch
    // addresses on behalf of the account
    pasteURL: false,
    // Runs after the read access check of the file route (locked media are 403 already)
    handlers: [
      (req, { doc, params }) => {
        // Photos for sale: visitors get the watermarked copies (/media-wm/…), never these files
        if (!req.user && (doc as { forSale?: boolean | null }).forSale) {
          return Response.json({ errors: [{ message: 'Not found.' }] }, {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          })
        }

        if (!req.user && isProtectedOriginal(doc as MediaFileDoc, params.filename)) {
          return Response.json({ errors: [{ message: 'Not found.' }] }, {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          })
        }
      },
    ],
    // Only the browser may cache files (a week), never a shared cache: whether a file may
    // be delivered depends on the login, and a locked file must not end up in a CDN/proxy.
    // Only called for successful responses, so errors are not cached.
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, max-age=604800')
      headers.set('Cross-Origin-Resource-Policy', 'same-site')
      return headers
    },
    // Only real photo/video formats. No SVG: SVG can contain scripts and would be
    // served from the same origin (stored XSS with a compromised admin account).
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
    imageSizes: [
      {
        name: 'thumb',
        width: 600,
        withoutEnlargement: true,
        formatOptions: { format: 'webp', options: { quality: 75 } },
      },
      {
        name: 'medium',
        width: 1280,
        height: 1280,
        fit: 'inside',
        withoutEnlargement: true,
        formatOptions: { format: 'webp', options: { quality: 80 } },
      },
      {
        name: 'large',
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true,
        formatOptions: { format: 'webp', options: { quality: 82 } },
      },
    ],
    adminThumbnail: 'thumb',
  },
  fields: [
    {
      name: 'alt',
      label: 'Alt text',
      type: 'text',
      admin: {
        description: 'Short image description (accessibility, SEO).',
      },
    },
    {
      name: 'name',
      label: 'Name / caption',
      type: 'text',
    },
    {
      // Confirmation for every upload (not needed for admins), see the contributor terms
      // (src/lib/contributor-terms.ts). Who and when is stored next to it.
      name: 'rightsConfirmed',
      label: 'Rights confirmed',
      type: 'checkbox',
      defaultValue: false,
      // The proof is for the admin area only, never part of the public API
      access: { read: loggedInField },
      admin: {
        description:
          'By ticking I confirm: I hold all rights to this file (copyright, consent of the people shown), it is not illegal, and I am responsible for it under the contributor terms. Required for every upload except by admins. Several files at once: “Edit all” → “Rights confirmed” → tick it once for all files.',
      },
    },
    {
      name: 'rightsConfirmedAt',
      label: 'Rights confirmed on',
      type: 'date',
      access: { ...serverOnly, read: loggedInField },
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => Boolean(data?.rightsConfirmedAt),
      },
    },
    {
      // E-mail and id of the account – kept as text, so the proof stays even if the account is deleted
      name: 'rightsConfirmedBy',
      label: 'Rights confirmed by',
      type: 'text',
      // Contains an e-mail address: only for logged-in accounts
      access: { ...serverOnly, read: loggedInField },
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.rightsConfirmedBy) },
    },
    {
      name: 'locked',
      type: 'checkbox',
      defaultValue: true,
      // Only the sync in src/lib/media-lock.ts (overrideAccess) may change it, not the API
      access: serverOnly,
      admin: {
        readOnly: true,
        description: 'Set automatically by the exhibition.',
      },
    },
    {
      // A print of this photo is offered (fixed price or price on request) in some exhibition:
      // visitors only get the watermarked versions (src/lib/watermark.ts). Set by the sync in
      // src/lib/media-lock.ts, like "locked".
      name: 'forSale',
      label: 'For sale (shown with watermark)',
      type: 'checkbox',
      defaultValue: false,
      access: serverOnly,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Set automatically by the prints of the exhibitions.',
      },
    },
    {
      // Which watermark (image, opacity, size, position) – part of the watermarked file names,
      // so a new watermark gives new URLs. Readable by everybody: it is part of those URLs anyway.
      name: 'watermarkKey',
      type: 'text',
      access: serverOnly,
      admin: { hidden: true },
    },
    ...auditFields({ updatedBy: false }),
  ],
}
