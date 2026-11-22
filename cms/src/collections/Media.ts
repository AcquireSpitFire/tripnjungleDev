import type { CollectionConfig } from 'payload'

// Images, videos and posters.
//
// On upload three WebP sizes are created (the original is kept):
//   thumb   600 px wide             admin, cards, phones
//   medium  1280 px longest side    slideshow, gallery, posters in lists
//   large   2560 px longest side    fullscreen, poster above the slideshow (4K desktop)
// Smaller originals are never enlarged.
//
// "locked" is not set by hand but by the exhibitions hook:
// posters are always public, cover and gallery of an exhibition are public
// exactly when the exhibition is unlocked.
// Without login the API (and the file route /api/media/file/…) only
// returns media with locked: false. New uploads are locked until an
// exhibition uses them.
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
    read: ({ req }) => (req.user ? true : { locked: { equals: false } }),
  },
  upload: {
    // Where the files are stored; when hosting, point it at a persistent volume (MEDIA_DIR)
    staticDir: process.env.MEDIA_DIR || 'media',
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
      admin: {
        readOnly: true,
        description: 'Set automatically by the exhibition.',
      },
    },
  ],
}
