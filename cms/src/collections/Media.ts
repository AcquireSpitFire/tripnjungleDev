import type { AccessResult, CollectionConfig, PayloadRequest, Where } from 'payload'

import {
  canManageExhibitions,
  getAccessibleMediaIds,
  getRole,
  getUserId,
} from '../access/roles'
import { auditFields, auditHook } from '../lib/audit'
import { limitPublicQueries } from '../lib/query-limits'

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
//     without generated sizes (very small files) keep their original.
//   - /api/media itself (list and single documents) is not public: the site only gets media
//     embedded in exhibitions and artists, so nobody can browse all public files at once.
function ownLockedUploadsOrManager(user: Parameters<typeof getRole>[0]): boolean | Where {
  if (canManageExhibitions(user)) {
    return true
  }

  const userId = getUserId(user)

  return getRole(user) && userId !== null
    ? { and: [{ createdBy: { equals: userId } }, { locked: { equals: true } }] }
    : false
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
    update: ({ req }) => ownLockedUploadsOrManager(req.user),
    delete: ({ req }) => ownLockedUploadsOrManager(req.user),
  },
  hooks: {
    // Page size for visitors/artists/editors at most 100 (src/lib/query-limits.ts)
    beforeOperation: [limitPublicQueries],
    beforeChange: [auditHook({ updatedBy: false })],
  },
  upload: {
    // Where the files are stored; when hosting, point it at a persistent volume (MEDIA_DIR)
    staticDir: process.env.MEDIA_DIR || 'media',
    // Runs after the read access check of the file route (locked media are 403 already)
    handlers: [
      (req, { doc, params }) => {
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
      name: 'locked',
      type: 'checkbox',
      defaultValue: true,
      // Only the sync in src/lib/media-lock.ts (overrideAccess) may change it, not the API
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Set automatically by the exhibition.',
      },
    },
    ...auditFields({ updatedBy: false }),
  ],
}
