// POST /shop/checkout { items, country } → { url } of the Stripe payment page.
// Holds the copies (order "pending") and opens Stripe Checkout, see src/lib/shop/checkout.ts.
// Rate limited per IP address in src/proxy.ts; at most 2 running checkouts with limited copies per
// connection (src/lib/shop/hold.ts).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { clientAddress } from '@/lib/client-address'
import { errorJson, json } from '@/lib/http'
import { parseCartItems } from '@/lib/shop/catalog'
import { createCheckout } from '@/lib/shop/checkout'
import { isCountryCode } from '@/lib/shop/countries'
import { holdKeyFor } from '@/lib/shop/hold'
import { shopPost } from '@/lib/shop/route'
import { getShopSettings } from '@/lib/shop/settings'
import { serverUrl } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

export const POST = shopPost(async (body, request) => {
  const items = parseCartItems(body.items)

  if (!items || !items.length) {
    return errorJson('Your cart is empty.', 400)
  }

  if (!isCountryCode(body.country)) {
    return errorJson('Choose the country of delivery.', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)

  if (!settings.enabled) {
    return errorJson('The shop is closed at the moment.', 503)
  }

  const holdKey = holdKeyFor(payload.secret, clientAddress(request.headers))
  const result = await createCheckout(payload, settings, items, body.country, serverUrl(), holdKey)

  return 'url' in result ? json({ url: result.url }) : errorJson(result.error, 409, { quote: result.quote })
})
