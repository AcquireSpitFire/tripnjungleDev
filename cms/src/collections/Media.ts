import type { CollectionConfig } from 'payload'

import { getRole, loggedInField } from '../access/roles'
import { serverOnly } from '../fields/server-only'
import { auditFields, auditHook } from '../lib/audit'
import { limitPublicQueries } from '../lib/query-limits'
import { changeMedia, hideFilesFromVisitors, readMedia } from './media/access'
import {
  removeWatermarkCopies,
  requireRightsConfirmation,
  resyncAfterReupload,
  stripMetadataOfSmallImages,
  watermarkedUrlsForVisitors,
} from './media/hooks'

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
//
// The rules in code: src/collections/media/access.ts (access, file route), media/hooks.ts (hooks).
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
    read: readMedia,
    create: ({ req }) => Boolean(getRole(req.user)),
    update: changeMedia,
    delete: changeMedia,
  },
  // What each hook does: src/collections/media/hooks.ts
  hooks: {
    // Page size for visitors/artists/editors at most 100 (src/lib/query-limits.ts)
    beforeOperation: [limitPublicQueries, stripMetadataOfSmallImages],
    beforeChange: [requireRightsConfirmation, auditHook({ updatedBy: false })],
    afterRead: [watermarkedUrlsForVisitors],
    afterChange: [resyncAfterReupload],
    afterDelete: [removeWatermarkCopies],
  },
  upload: {
    // Where the files are stored; when hosting, point it at a persistent volume (MEDIA_DIR)
    staticDir: process.env.MEDIA_DIR || 'media',
    // Files only from the own computer, no "paste URL": the server would otherwise fetch
    // addresses on behalf of the account
    pasteURL: false,
    // Runs after the read access check of the file route (locked media are 403 already)
    handlers: [hideFilesFromVisitors],
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
