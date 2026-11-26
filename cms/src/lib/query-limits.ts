// Caps the page size of API queries for visitors and artist/editor accounts.
//
// Without it, "?limit=0" or "?pagination=false" returns every document in one response
// (expensive with depth=2). The site itself never asks for more than 100 (public/js/data.js,
// src/lib/seo.ts). Managers, admins and server code with overrideAccess stay unlimited
// (e.g. the media lock sync, which must see all exhibitions).
import type { CollectionBeforeOperationHook } from 'payload'

import { canManageExhibitions } from '../access/roles'

const MAX_PUBLIC_LIMIT = 100

export const limitPublicQueries: CollectionBeforeOperationHook = ({ args, operation, overrideAccess, req }) => {
  if (operation !== 'read' || overrideAccess || canManageExhibitions(req.user)) {
    return args
  }

  const queryArgs = args as { limit?: number; pagination?: boolean }

  if (queryArgs.pagination === false) {
    queryArgs.pagination = true
    queryArgs.limit = MAX_PUBLIC_LIMIT
  }

  if (queryArgs.limit !== undefined) {
    const limit = Number(queryArgs.limit)

    queryArgs.limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_PUBLIC_LIMIT) : MAX_PUBLIC_LIMIT
  }

  return args
}
