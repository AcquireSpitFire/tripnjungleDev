// POST /shop/quote { items: [{ exhibition, photo, print, quantity }], country }
// Current details, copies left, shipping and totals for the cart page (public/js/cart.js).
// Reserves nothing; the checkout calculates everything again.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { parseCartItems } from '@/lib/shop/catalog'
import { quoteCart } from '@/lib/shop/checkout'
import { isCountryCode } from '@/lib/shop/countries'
import { errorJson, isSameOrigin, json, readJson } from '@/lib/shop/http'
import { getShopSettings } from '@/lib/shop/settings'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorJson('Forbidden', 403)
  }

  const body = await readJson(request)
  const items = body && parseCartItems(body.items)

  if (!body || !items) {
    return errorJson('Invalid cart', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)

  return json(await quoteCart(payload, settings, items, isCountryCode(body.country) ? body.country : null))
}
