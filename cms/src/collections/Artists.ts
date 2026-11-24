import type { AccessResult, CollectionConfig, FieldAccess } from 'payload'

import {
  canManageExhibitions,
  exhibitionManagersOnlyField,
  getArtistProfileId,
  isArtist,
} from '../access/roles'
import { assertMediaMayBeAdded, syncMediaLocks } from '../lib/media-lock'
import { limitPublicQueries } from '../lib/query-limits'
import { toId } from '../lib/visibility'

// Artist profiles: credited on exhibitions and photos, each with a small page
// /artist/<slug> (src/app/artist/[slug]/route.ts). Two kinds of page:
//
//   profile   – a mini page on Tripnjungle: portrait, short text, links, contact
//               and the public exhibitions of the artist
//   external  – /artist/<slug> forwards to the artist's own website
//
// Contact on the mini page:
//   tripnjungle – inquiries go to the contact address of the Site settings
//   artist      – the artist's own e-mail/phone, only shown when the box
//                 "Artist agreed to publish these contact details" is ticked
//                 (without it the API does not even return them to visitors)
//
// An artist account (role "artist", linked in Accounts → Artist profile) may edit
// its own profile, but not the slug. Managers create and delete profiles.

const httpsUrl = (value: unknown) =>
  !value || (typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value.trim()))
    ? true
    : 'Please enter a full https:// address.'

// Contact details only for logged-in accounts, or publicly when the artist agreed
const contactRead: FieldAccess = ({ req, doc }) =>
  Boolean(req.user) || (doc?.contactVia === 'artist' && doc?.contactConsent === true)

const isProfile = (data: Record<string, unknown> | undefined) => (data?.pageType || 'profile') === 'profile'
const contactViaArtist = (data: Record<string, unknown> | undefined) =>
  isProfile(data) && data?.contactVia === 'artist'

export const Artists: CollectionConfig = {
  slug: 'artists',
  labels: {
    singular: 'Artist',
    plural: 'Artists',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'pageType', 'updatedAt'],
    description: 'People who make the photos and exhibitions. Each artist has a page at /artist/<slug>.',
  },
  access: {
    // Names and profiles are public credits
    read: () => true,
    create: ({ req }) => canManageExhibitions(req.user),
    update: ({ req }): AccessResult => {
      if (canManageExhibitions(req.user)) {
        return true
      }

      const profileId = getArtistProfileId(req.user)

      return isArtist(req.user) && profileId !== null ? { id: { equals: profileId } } : false
    },
    delete: ({ req }) => canManageExhibitions(req.user),
  },
  hooks: {
    // Page size for visitors/artists/editors at most 100 (src/lib/query-limits.ts)
    beforeOperation: [limitPublicQueries],
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        // A portrait becomes public: artist accounts may only choose public media or their own uploads
        const next = toId('portrait' in data ? data.portrait : originalDoc?.portrait)
        const previous = toId(originalDoc?.portrait)

        await assertMediaMayBeAdded(
          req,
          next === null ? [] : [next],
          previous === null ? [] : [previous],
          'artists',
        )

        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // The portrait is public as long as a profile uses it
        await syncMediaLocks(req, [toId(doc.portrait), toId(previousDoc?.portrait)].filter((id) => id !== null))
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const id = toId(doc.portrait)

        if (id !== null) {
          await syncMediaLocks(req, [id])
        }

        return doc
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      label: 'ID (URL)',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: exhibitionManagersOnlyField },
      admin: {
        description: 'Lowercase letters, numbers and hyphens, e.g. tom. The page is /artist/<ID>.',
      },
      validate: (value: unknown) =>
        typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
          ? true
          : 'Lowercase letters, numbers and hyphens only.',
    },
    {
      name: 'portrait',
      label: 'Portrait',
      type: 'upload',
      relationTo: 'media',
      filterOptions: () => true,
      admin: { description: 'Optional. Public as soon as it is saved here.' },
    },
    {
      name: 'pageType',
      label: 'Artist page',
      type: 'select',
      required: true,
      defaultValue: 'profile',
      options: [
        { label: 'Mini page on Tripnjungle (text and contact)', value: 'profile' },
        { label: 'Link to the artist’s own website', value: 'external' },
      ],
      admin: { isClearable: false },
    },
    {
      name: 'externalUrl',
      label: 'Website of the artist',
      type: 'text',
      admin: {
        condition: (data) => data?.pageType === 'external',
        placeholder: 'https://…',
        description: '/artist/<ID> forwards to this address.',
      },
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) => {
        if (siblingData?.pageType === 'external' && !value) {
          return 'Required for “Link to the artist’s own website”.'
        }

        return httpsUrl(value)
      },
    },
    {
      name: 'shortText',
      label: 'Short text',
      type: 'textarea',
      maxLength: 5000,
      admin: {
        condition: (data) => isProfile(data),
        description: 'A few sentences about the artist. Blank line = new paragraph.',
      },
    },
    {
      type: 'row',
      admin: { condition: (data) => isProfile(data) },
      fields: [
        {
          name: 'website',
          label: 'Website',
          type: 'text',
          admin: { placeholder: 'https://…', width: '50%' },
          validate: httpsUrl,
        },
        {
          name: 'instagram',
          label: 'Instagram',
          type: 'text',
          admin: { placeholder: 'https://instagram.com/…', width: '50%' },
          validate: httpsUrl,
        },
      ],
    },
    {
      name: 'contactVia',
      label: 'Contact',
      type: 'select',
      defaultValue: 'tripnjungle',
      options: [
        { label: 'Via Tripnjungle (contact address of the Site settings)', value: 'tripnjungle' },
        { label: 'The artist’s own contact details', value: 'artist' },
      ],
      admin: { condition: (data) => isProfile(data), isClearable: false },
    },
    {
      type: 'row',
      admin: { condition: (data) => contactViaArtist(data) },
      fields: [
        {
          name: 'contactEmail',
          label: 'E-mail',
          type: 'email',
          access: { read: contactRead },
          admin: { width: '50%' },
        },
        {
          name: 'contactPhone',
          label: 'Phone',
          type: 'text',
          access: { read: contactRead },
          admin: { width: '50%' },
          validate: (value: unknown) =>
            !value || (typeof value === 'string' && /^[+\d][\d\s/().-]{4,}$/.test(value.trim()))
              ? true
              : 'Digits, spaces and + / ( ) - only.',
        },
      ],
    },
    {
      name: 'contactConsent',
      label: 'The artist agreed to publish these contact details',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (data) => contactViaArtist(data),
        description: 'Without this tick, e-mail and phone are not shown on the page (privacy).',
      },
    },
  ],
}
