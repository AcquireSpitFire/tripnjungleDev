// POST /shop/checkout/release { release: "<order id>.<token>" } → { released }
// The buyer came back from the Stripe page without paying (cancel_url → /cart?released=…): the
// copies held for that checkout are free again at once. Only with the token from the cancel_url,
// see src/lib/shop/hold.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { parseReleaseValue, releaseCheckout } from '@/lib/shop/hold'
import { errorJson, isSameOrigin, json, readJson } from '@/lib/shop/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorJson('Forbidden', 403)
  }

  const body = await readJson(request)
  const payload = await getPayload({ config: configPromise })
  const orderId = parseReleaseValue(payload.secret, body?.release)

  if (orderId === null) {
    return errorJson('Forbidden', 403)
  }

  return json({ released: await releaseCheckout(payload, orderId) })
}
