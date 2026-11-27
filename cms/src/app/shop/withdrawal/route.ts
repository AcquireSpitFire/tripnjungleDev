// POST /shop/withdrawal { name, orderNumber, email, statement } → { ok, received } or { error }
// The withdrawal function as JSON for public/js/withdrawal-form.js; the logic is in
// src/lib/shop/withdrawal.ts (the same form also works without JavaScript: POST /withdrawal).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { errorJson, json } from '@/lib/http'
import { shopPost } from '@/lib/shop/route'
import { recordWithdrawal } from '@/lib/shop/withdrawal'

export const dynamic = 'force-dynamic'

export const POST = shopPost(async (body) => {
  const result = await recordWithdrawal(await getPayload({ config: configPromise }), body)

  return result.ok
    ? json({ ok: true, received: result.received, ...(result.note ? { note: result.note } : {}) })
    : errorJson(result.error, result.status)
})
