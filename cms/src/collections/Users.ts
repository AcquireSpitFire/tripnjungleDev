import {
  APIError,
  ValidationError,
  type AccessResult,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'

import {
  acceptContributorTermsEndpoint,
  contributorTermsEndpoint,
} from '../endpoints/contributor-terms'
import { serverOnly } from '../fields/server-only'
import { serverUrl } from '../lib/site-identity'

import {
  ROLE_OPTIONS,
  SECTION_OPTIONS,
  adminOnlyField,
  canManageExhibitions,
  getRole,
  getUserId,
  isAdmin,
} from '../access/roles'

// Accounts for the admin panel. Roles and what they may do: src/access/roles.ts.
//
// Security:
//   - The very first account always becomes admin; afterwards only admins create accounts.
//   - Only admins change roles and sections, also not on their own account.
//   - The last admin can neither be deleted nor demoted.
//   - Accounts are never locked after wrong passwords (anybody could otherwise lock the admin
//     out); the login is limited per address and account instead (src/proxy.ts).
//   - Sessions are stored on the server, so logging out takes effect immediately.
//   - Passwords need at least 12 characters.

const MIN_PASSWORD_LENGTH = 12

async function countOtherAdmins(req: PayloadRequest, excludeId: number | string) {
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    where: { and: [{ role: { equals: 'admin' } }, { id: { not_equals: excludeId } }] },
    overrideAccess: true,
    req,
  })

  return totalDocs
}

const lastAdminMessage =
  'At least one admin account has to remain. Make another account admin first.'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Account',
    plural: 'Accounts',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'sections', 'updatedAt'],
    description:
      'Admin: everything. Manager: the selected sections (one account per sub page). Artist: own exhibitions, linked to an artist profile. Editor: the exhibitions they are assigned to.',
    // Only admins manage accounts; everybody reaches their own account via the avatar
    hidden: ({ user }) => !isAdmin(user),
  },
  auth: {
    // No account lock: see the comment at the top and src/proxy.ts
    maxLoginAttempts: 0,
    tokenExpiration: 2 * 60 * 60,
    useSessions: true,
    cookies: {
      sameSite: 'Strict',
      // Only over HTTPS (a local "npm start" on http://localhost still works)
      secure: serverUrl().startsWith('https://'),
    },
  },
  access: {
    // Admin panel only with a valid role
    admin: ({ req }) => Boolean(getRole(req.user)),
    read: ({ req }): AccessResult => {
      if (isAdmin(req.user)) {
        return true
      }

      const id = getUserId(req.user)

      if (id === null) {
        return false
      }

      // Managers pick artists and editors for exhibitions
      if (canManageExhibitions(req.user)) {
        return { or: [{ id: { equals: id } }, { role: { in: ['artist', 'editor'] } }] }
      }

      return { id: { equals: id } }
    },
    create: ({ req }) => isAdmin(req.user),
    update: ({ req }): AccessResult => {
      if (isAdmin(req.user)) {
        return true
      }

      const id = getUserId(req.user)

      return id === null ? false : { id: { equals: id } }
    },
    delete: ({ req }) => isAdmin(req.user),
    unlock: ({ req }) => isAdmin(req.user),
  },
  endpoints: [contributorTermsEndpoint, acceptContributorTermsEndpoint],
  hooks: {
    // Before every operation that sets a password: create, update and reset (a field hook
    // would not see the new password on reset, Payload hashes it before the field hooks)
    beforeOperation: [
      ({ args, operation }) => {
        if (operation !== 'create' && operation !== 'update' && operation !== 'resetPassword') {
          return args
        }

        const password = (args as { data?: { password?: unknown } }).data?.password

        if (
          typeof password === 'string' &&
          password.length > 0 &&
          password.length < MIN_PASSWORD_LENGTH
        ) {
          throw new ValidationError({
            collection: 'users',
            errors: [
              {
                path: 'password',
                message: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
              },
            ],
          })
        }

        return args
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            overrideAccess: true,
            req,
          })

          // First account: always admin (whoever opens /admin first after the deploy)
          if (totalDocs === 0) {
            data.role = 'admin'
          }

          data.role = data.role || 'editor'
        }

        if (
          operation === 'update' &&
          originalDoc?.role === 'admin' &&
          data.role &&
          data.role !== 'admin' &&
          (await countOtherAdmins(req, originalDoc.id)) === 0
        ) {
          throw new APIError(lastAdminMessage, 400, null, true)
        }

        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const user = await req.payload.findByID({
          collection: 'users',
          id,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (user?.role === 'admin' && (await countOtherAdmins(req, id)) === 0) {
          throw new APIError(lastAdminMessage, 400, null, true)
        }
      },
    ],
  },
  fields: [
    // E-mail and password are added by Payload (auth: true)
    {
      name: 'name',
      label: 'Name',
      type: 'text',
    },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [...ROLE_OPTIONS],
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: {
        isClearable: false,
        description: 'Only admins can change roles. The very first account always becomes admin.',
      },
    },
    {
      name: 'sections',
      label: 'Sections',
      type: 'select',
      hasMany: true,
      options: [...SECTION_OPTIONS],
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: {
        condition: (data) => data?.role === 'manager',
        description: 'The sub pages this manager is responsible for.',
      },
    },
    {
      name: 'artist',
      label: 'Artist profile',
      type: 'relationship',
      relationTo: 'artists',
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: {
        condition: (data) => data?.role === 'artist',
        description:
          'The profile this account belongs to. The account may edit this profile and every exhibition that credits it.',
      },
    },
    {
      // Text of the terms and the "I accept" button (only on the own account; src/lib/contributor-terms.ts)
      name: 'contributorTerms',
      type: 'ui',
      admin: {
        position: 'sidebar',
        condition: (data) => data?.role !== 'admin',
        components: { Field: '/components/ContributorTerms#ContributorTerms' },
      },
    },
    // Proof of the acceptance: set only by POST /api/users/contributor-terms/accept
    {
      name: 'termsAcceptedAt',
      label: 'Contributor terms accepted on',
      type: 'date',
      access: serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data?.role !== 'admin' && Boolean(data?.termsAcceptedAt),
      },
    },
    {
      name: 'termsAcceptedVersion',
      label: 'Accepted version',
      type: 'text',
      access: serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => data?.role !== 'admin' && Boolean(data?.termsAcceptedVersion),
      },
    },
    {
      name: 'termsAcceptedText',
      label: 'Accepted text (copy)',
      type: 'textarea',
      access: serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => data?.role !== 'admin' && Boolean(data?.termsAcceptedText),
      },
    },
  ],
}
