// POST /shop/checkout/release { release: "<order id>.<token>" } → { released }
// The buyer came back from the Stripe page without paying (cancel_url → /cart?released=…): the
// copies held for that checkout are free again at once. Only with the token from the cancel_url,
// see src/lib/shop/hold.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { errorJson, json } from '@/lib/http'
import { parseReleaseValue, releaseCheckout } from '@/lib/shop/hold'
import { shopPost } from '@/lib/shop/route'

export const dynamic = 'force-dynamic'

export const POST = shopPost(async (body) => {
  const payload = await getPayload({ config: configPromise })
  const orderId = parseReleaseValue(payload.secret, body.release)

  if (orderId === null) {
    return errorJson('Forbidden', 403)
  }

  return json({ released: await releaseCheckout(payload, orderId) })
})
