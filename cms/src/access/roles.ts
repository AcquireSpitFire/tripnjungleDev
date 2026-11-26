// Roles and access helpers. Every collection checks permissions only through
// these functions, so the rules live in one place.
//
//   admin    – everything: accounts, site settings, all sections
//   manager  – full control over the sections listed in "sections"
//              (one manager account per sub page, e.g. Exhibitions)
//   artist   – linked to an artist profile; creates exhibitions (they always
//              start as Planning + Locked) and edits the ones that credit
//              their profile; cannot publish
//   editor   – edits the content of the exhibitions they are assigned to
//              (field "editors"); cannot publish, create or delete
import type { FieldAccess, PayloadRequest, Where } from 'payload'

import { toId } from '../lib/visibility'

export const ROLE_OPTIONS = [
  { label: 'Admin (everything)', value: 'admin' },
  { label: 'Manager (one or more sections)', value: 'manager' },
  { label: 'Artist (own exhibitions)', value: 'artist' },
  { label: 'Editor (assigned exhibitions)', value: 'editor' },
] as const

// Sub pages a manager can be responsible for. Release 4.0 adds radio, mag, adventure.
//   exhibitions – exhibitions, media, artists and the prints offered in them (prices, copies, watermark)
//   shop        – orders and price requests (buyers' data, shipping)
export const SECTION_OPTIONS = [
  { label: 'Exhibitions', value: 'exhibitions' },
  { label: 'Shop (orders and price requests)', value: 'shop' },
] as const

export type Role = (typeof ROLE_OPTIONS)[number]['value']
export type Section = (typeof SECTION_OPTIONS)[number]['value']

// req.user on the server, the client user in admin.hidden – both carry the role fields
type MaybeUser = { collection?: string } | null | undefined

type RoleUser = {
  id: number | string
  role?: string | null
  sections?: string[] | null
  artist?: number | string | { id: number | string } | null
}

function asRoleUser(user: MaybeUser): RoleUser | null {
  return user && typeof user === 'object' && user.collection === 'users' ? (user as unknown as RoleUser) : null
}

export function getRole(user: MaybeUser): Role | null {
  const role = asRoleUser(user)?.role

  return ROLE_OPTIONS.some((option) => option.value === role) ? (role as Role) : null
}

export function isAdmin(user: MaybeUser): boolean {
  return getRole(user) === 'admin'
}

function managesSection(user: MaybeUser, section: Section): boolean {
  if (isAdmin(user)) {
    return true
  }

  return getRole(user) === 'manager' && Boolean(asRoleUser(user)?.sections?.includes(section))
}

export function canManageExhibitions(user: MaybeUser): boolean {
  return managesSection(user, 'exhibitions')
}

// Orders and price requests contain buyers' data: only for the section "Shop"
export function canManageShop(user: MaybeUser): boolean {
  return managesSection(user, 'shop')
}

export function isArtist(user: MaybeUser): boolean {
  return getRole(user) === 'artist'
}

function isEditor(user: MaybeUser): boolean {
  return getRole(user) === 'editor'
}

// Id of the artist profile linked to an artist account (null if none)
export function getArtistProfileId(user: MaybeUser): number | string | null {
  return toId(asRoleUser(user)?.artist)
}

export function getUserId(user: MaybeUser): number | string | null {
  return asRoleUser(user)?.id ?? null
}

// Field access shortcuts
export const adminOnlyField: FieldAccess = ({ req }) => isAdmin(req.user)
export const exhibitionManagersOnlyField: FieldAccess = ({ req }) => canManageExhibitions(req.user)
export const loggedInField: FieldAccess = ({ req }) => Boolean(getRole(req.user))

const EXHIBITION_IDS_KEY = 'tj:accessibleExhibitionIds'
const MEDIA_IDS_KEY = 'tj:accessibleMediaIds'

// Conditions for the exhibitions an artist or editor works on
function ownExhibitionsWhere(user: MaybeUser): Where[] {
  const conditions: Where[] = []
  const artistId = getArtistProfileId(user)

  // Artists: every exhibition that credits their profile
  if (isArtist(user) && artistId !== null) {
    conditions.push({ artists: { in: [artistId] } })
  }

  // Editors (and artists): every exhibition they are assigned to
  const userId = getUserId(user)

  if ((isEditor(user) || isArtist(user)) && userId !== null) {
    conditions.push({ editors: { in: [userId] } })
  }

  return conditions
}

// Ids of the exhibitions a logged-in artist/editor may see and edit.
// Cached per request in req.context (cleared by the exhibitions afterChange hook).
export async function getAccessibleExhibitionIds(req: PayloadRequest): Promise<(number | string)[]> {
  const cached = req.context?.[EXHIBITION_IDS_KEY] as (number | string)[] | undefined

  if (cached) {
    return cached
  }

  const conditions = ownExhibitionsWhere(req.user)
  let ids: (number | string)[] = []

  if (conditions.length) {
    const result = await req.payload.find({
      collection: 'exhibitions',
      where: conditions.length === 1 ? conditions[0] : { or: conditions },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
      select: {},
    })

    ids = result.docs.map((doc) => doc.id)
  }

  req.context[EXHIBITION_IDS_KEY] = ids

  return ids
}

// Ids of all media used by the exhibitions of a logged-in artist/editor
export async function getAccessibleMediaIds(req: PayloadRequest): Promise<(number | string)[]> {
  const cached = req.context?.[MEDIA_IDS_KEY] as (number | string)[] | undefined

  if (cached) {
    return cached
  }

  const exhibitionIds = await getAccessibleExhibitionIds(req)
  const ids = new Set<number | string>()

  if (exhibitionIds.length) {
    const result = await req.payload.find({
      collection: 'exhibitions',
      where: { id: { in: exhibitionIds } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })

    for (const doc of result.docs) {
      for (const ref of [...(doc.posters || []), doc.frontPage, ...(doc.gallery || []).map((row) => row.file)]) {
        const id = ref && typeof ref === 'object' ? ref.id : ref

        if (id !== null && id !== undefined) {
          ids.add(id)
        }
      }
    }
  }

  const list = [...ids]

  req.context[MEDIA_IDS_KEY] = list

  return list
}

export function clearAccessCache(req: PayloadRequest): void {
  delete req.context[EXHIBITION_IDS_KEY]
  delete req.context[MEDIA_IDS_KEY]
}

// "id in list" as a Where. An empty list matches nothing (id is never empty), so an
// account without exhibitions gets an empty list in the admin instead of an error.
export function idIn(ids: (number | string)[]): Where {
  return ids.length ? { id: { in: ids } } : { id: { exists: false } }
}
