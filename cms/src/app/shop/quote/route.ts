// POST /shop/quote { items: [{ exhibition, photo, print, quantity }], country }
// Current details, copies left, shipping and totals for the cart page (public/js/cart.js).
// Reserves nothing; the checkout calculates everything again.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { errorJson, json } from '@/lib/http'
import { parseCartItems } from '@/lib/shop/catalog'
import { quoteCart } from '@/lib/shop/checkout'
import { isCountryCode } from '@/lib/shop/countries'
import { shopPost } from '@/lib/shop/route'
import { getShopSettings } from '@/lib/shop/settings'

export const dynamic = 'force-dynamic'

export const POST = shopPost(async (body) => {
  const items = parseCartItems(body.items)

  if (!items) {
    return errorJson('Invalid cart', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)

  return json(await quoteCart(payload, settings, items, isCountryCode(body.country) ? body.country : null))
})
