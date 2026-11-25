// GET /shop/offers?exhibition=<id>: the prints of an exhibition with price and copies left, for
// public/js/shop.js on the exhibition and photo pages. Same visibility as the exhibition for
// visitors (nothing for locked or planned exhibitions). Never cached: the copies left change
// with every order.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { findOffers } from '@/lib/shop/catalog'
import { errorJson, json } from '@/lib/shop/http'
import { getShopSettings } from '@/lib/shop/settings'
import { copiesLeft, countTaken } from '@/lib/shop/stock'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const slug = (new URL(request.url).searchParams.get('exhibition') || '').toLowerCase()

  if (!/^[a-z0-9-]{1,100}$/.test(slug)) {
    return errorJson('Invalid exhibition', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)

  if (!settings.enabled) {
    return json({ enabled: false, offers: [] })
  }

  const offers = [...(await findOffers(payload, [slug])).values()]
  const taken = await countTaken(
    payload,
    offers.map((offer) => offer.printId),
  )

  return json({
    enabled: true,
    vatNote: settings.vatNote,
    offers: offers.map((offer) => ({
      exhibition: offer.exhibitionSlug,
      photo: offer.mediaId,
      print: offer.printId,
      label: offer.label,
      size: offer.size,
      material: offer.material,
      details: offer.details,
      pricing: offer.pricing,
      price: offer.price,
      copies: offer.copies,
      left: copiesLeft(offer, taken),
    })),
  })
}
