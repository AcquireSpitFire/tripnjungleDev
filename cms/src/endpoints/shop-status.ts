// GET /api/globals/site/shop-status: what the shop still needs (src/components/ShopStatus.tsx).
// Admins only; tells which server variables are set, never their values.
import type { Endpoint } from 'payload'

import { isAdmin } from '../access/roles'
import { errorJson, json } from '../lib/http'
import { shopStatus } from '../lib/shop/settings'

export const shopStatusEndpoint: Endpoint = {
  path: '/shop-status',
  method: 'get',
  handler: async (req) => {
    if (!isAdmin(req.user)) {
      return errorJson('Not allowed.', 403)
    }

    const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })

    return json(shopStatus(site))
  },
}
