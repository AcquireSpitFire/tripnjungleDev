import type { CollectionConfig, FieldAccess, Payload, PayloadRequest } from 'payload'

import { getYouTubeId } from '../lib/youtube'

// An exhibition.
//
// Two settings control what visitors see:
//
//   release     scheduled   – with a date (Events until the date, Archive afterwards)
//               comingSoon  – without a date, listed at the end of the upcoming events
//               planning    – only visible in the admin; for visitors the
//                             exhibition does not exist (posters locked too)
//
//   visibility  locked      – poster and details visible, content not
//               link        – like locked, but /exhibition/<id> shows the content
//                             (missing from slideshow, exhibitions list, sitemap)
//               public      – unlocked
//
// "locked" (true/false) stays as a derived field for API and frontend:
// locked = visibility !== 'public'. Old entries without visibility/release
// are read from "locked" or as "scheduled".
//
// Access without login:
//   - The API does not return exhibitions in "planning".
//   - Cover and gallery are missing from the response, except for public and link.
//   - The media files themselves are protected by the media collection
//     (field "locked", see syncMediaLock).

type Visibility = 'locked' | 'link' | 'public'
type Release = 'scheduled' | 'comingSoon' | 'planning'

type Settings = {
  locked?: boolean | null
  visibility?: Visibility | null
  release?: Release | null
}

function getVisibility(doc: Settings | null | undefined): Visibility {
  return doc?.visibility || (doc?.locked === false ? 'public' : 'locked')
}

function getRelease(doc: Settings | null | undefined): Release {
  return doc?.release || 'scheduled'
}

// Content (cover, gallery) available to visitors?
function contentIsOpen(doc: Settings | null | undefined): boolean {
  return getRelease(doc) !== 'planning' && getVisibility(doc) !== 'locked'
}

// Only see cover and gallery when logged in, public or "with link"
const onlyWhenUnlocked: FieldAccess = ({ req, doc }) => Boolean(req.user) || contentIsOpen(doc)

type MediaRef = number | string | { id: number | string } | null | undefined

function toId(ref: MediaRef): number | string | null {
  if (ref === null || ref === undefined) {
    return null
  }

  return typeof ref === 'object' ? ref.id : ref
}

// Sets "locked" on all media of the exhibition:
// posters → public (except in "planning"), cover + gallery → public
// for public and link
async function syncMediaLock(
  payload: Payload,
  req: PayloadRequest,
  doc: Settings & {
    posters?: MediaRef[] | null
    frontPage?: MediaRef
    gallery?: { file?: MediaRef }[] | null
  },
) {
  const updates = new Map<number | string, boolean>()
  const planning = getRelease(doc) === 'planning'

  for (const poster of doc.posters || []) {
    const id = toId(poster)

    if (id !== null) {
      updates.set(id, planning)
    }
  }

  const locked = !contentIsOpen(doc)
  const frontPageId = toId(doc.frontPage)

  if (frontPageId !== null && !updates.has(frontPageId)) {
    updates.set(frontPageId, locked)
  }

  for (const row of doc.gallery || []) {
    const id = toId(row.file)

    if (id !== null && !updates.has(id)) {
      updates.set(id, locked)
    }
  }

  for (const [id, value] of updates) {
    await payload.update({
      collection: 'media',
      id,
      data: { locked: value },
      req,
      overrideAccess: true,
    })
  }
}

export const Exhibitions: CollectionConfig = {
  slug: 'exhibitions',
  labels: {
    singular: 'Exhibition',
    plural: 'Exhibitions',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'release', 'date', 'visibility', 'updatedAt'],
  },
  access: {
    // Visitors do not see exhibitions in "planning" (old entries without the field count as scheduled)
    read: ({ req }) =>
      req.user
        ? true
        : { or: [{ release: { not_equals: 'planning' } }, { release: { exists: false } }] },
  },
  defaultSort: 'date',
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        // Partial updates lack fields in data; then the stored state applies
        const visibility = getVisibility({
          visibility: data.visibility ?? originalDoc?.visibility,
          locked: data.locked ?? originalDoc?.locked,
        })

        data.visibility = visibility
        data.release = data.release ?? originalDoc?.release ?? 'scheduled'
        data.locked = visibility !== 'public'

        // Bulk upload: append the files as new rows to "gallery", then empty the field
        const bulk = ((data.bulkMedia as MediaRef[] | undefined) || [])
          .map(toId)
          .filter((id): id is number | string => id !== null)

        if (bulk.length) {
          const rows: { file?: MediaRef; name?: string | null; alt?: string | null }[] = [
            ...(data.gallery ?? originalDoc?.gallery ?? []),
          ]
          const present = new Set(rows.map((row) => String(toId(row.file))))

          for (const id of bulk) {
            if (!present.has(String(id))) {
              // Copy the alt text entered in the upload dialog into the row
              const media = await req.payload
                .findByID({ collection: 'media', id, depth: 0, req, overrideAccess: true })
                .catch(() => null)

              rows.push({ file: id, name: '', alt: media?.alt || '' })
              present.add(String(id))
            }
          }

          data.gallery = rows
        }

        data.bulkMedia = []

        return data
      },
    ],
    afterRead: [
      ({ doc }) => {
        // Deliver old entries (columns still empty) with derived values
        doc.visibility = getVisibility(doc)
        doc.release = getRelease(doc)

        return doc
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        await syncMediaLock(req.payload, req, doc)
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Lock the media of a deleted exhibition again
        await syncMediaLock(req.payload, req, { ...doc, release: 'planning' })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'slug',
      label: 'ID (URL)',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Lowercase letters, numbers and hyphens only, e.g. exhibition-3. Used in the URL.',
      },
      validate: (value: unknown) =>
        typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
          ? true
          : 'Lowercase letters, numbers and hyphens only.',
    },
    {
      // Public link with a copy button (sidebar, only after the first save)
      name: 'publicLink',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/ExhibitionLink#ExhibitionLink' },
      },
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'theme',
      label: 'Theme',
      type: 'text',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
    },
    {
      name: 'release',
      label: 'Release',
      type: 'select',
      // Default as a function: applies in the form, but not as a column default in the database
      defaultValue: () => 'scheduled',
      options: [
        { label: 'Date', value: 'scheduled' },
        { label: 'Coming soon (no date, at the end of the events)', value: 'comingSoon' },
        { label: 'Planning (only visible in the admin)', value: 'planning' },
      ],
      admin: {
        isClearable: false,
        description:
          'Date: listed under Events, in the Archive after the date. Coming soon: listed without a date at the end of the events. Planning: already created, but not visible to visitors anywhere.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          label: 'Date',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayOnly', displayFormat: 'dd.MM.yyyy' },
            width: '34%',
            condition: (data) => (data?.release || 'scheduled') === 'scheduled',
          },
        },
        {
          name: 'time',
          label: 'Time',
          type: 'text',
          admin: {
            placeholder: '19:00',
            width: '33%',
            condition: (data) => (data?.release || 'scheduled') === 'scheduled',
          },
          validate: (value: unknown) =>
            !value || (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value))
              ? true
              : 'Format HH:MM, e.g. 19:00.',
        },
        {
          name: 'location',
          label: 'Location',
          type: 'text',
          admin: { width: '33%' },
        },
      ],
    },
    {
      name: 'visibility',
      label: 'Visibility',
      type: 'select',
      defaultValue: () => 'locked',
      options: [
        { label: 'Locked', value: 'locked' },
        { label: 'Locked with link', value: 'link' },
        { label: 'Public', value: 'public' },
      ],
      admin: {
        isClearable: false,
        description:
          'Locked: poster and details are visible, the exhibition itself (cover, images, videos) is not. Locked with link: like locked, but whoever knows the address /exhibition/<ID> sees the exhibition. Public: visible to everyone, also in the slideshow and Exhibitions.',
      },
    },
    {
      // Derived from "visibility" (see beforeChange); kept for API and frontend
      name: 'locked',
      type: 'checkbox',
      defaultValue: true,
      admin: { hidden: true },
    },
    {
      name: 'video',
      label: 'Intro video (YouTube)',
      type: 'text',
      admin: {
        placeholder: 'https://www.youtube.com/watch?v=…',
        description: 'Played before the exhibition and embedded on the exhibition page.',
      },
      validate: (value: unknown) =>
        !value || getYouTubeId(value) ? true : 'Not a valid YouTube URL or ID.',
    },
    {
      name: 'posters',
      label: 'Posters',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      admin: {
        description: 'Posters for the home page, Events and Archive. Public, except in the release “Planning”.',
      },
    },
    {
      name: 'frontPage',
      label: 'Cover',
      type: 'upload',
      relationTo: 'media',
      access: { read: onlyWhenUnlocked },
      admin: {
        description: 'Image or video for the slideshow and the Exhibitions list.',
      },
    },
    {
      // Bulk upload: "Create New" opens Payload's dialog for multiple files.
      // On save the files move as new rows to the end of "gallery"
      // (beforeChange); this field is empty again afterwards.
      name: 'bulkMedia',
      label: 'Add several photos at once',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      access: { read: ({ req }) => Boolean(req.user) },
      admin: {
        description:
          'Choose “Create New”, drop all files at once (10, 20 or more) and save; the alt text can already be entered per file. After saving the exhibition they appear below under “Images and videos”, where name and alt text can be changed at any time.',
      },
    },
    {
      name: 'gallery',
      label: 'Images and videos',
      type: 'array',
      labels: { singular: 'Item', plural: 'Items' },
      access: { read: onlyWhenUnlocked },
      admin: {
        description: 'Reorder by drag & drop. Shown in the slideshow and the gallery.',
      },
      fields: [
        {
          name: 'file',
          label: 'File',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'name',
          label: 'Name / caption',
          type: 'text',
        },
        {
          // Taken from the file's alt text on bulk upload, editable here afterwards.
          // Empty = alt text of the file (media collection).
          name: 'alt',
          label: 'Alt text',
          type: 'text',
          admin: { description: 'Short image description (accessibility, SEO).' },
        },
      ],
    },
  ],
}
