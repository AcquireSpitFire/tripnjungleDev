// GET /shop/offers?exhibition=<id>: the prints of an exhibition with price and copies left, for
// public/js/shop.js on the exhibition and photo pages. Same visibility as the exhibition for
// visitors (nothing for locked or planned exhibitions, nothing while the shop is closed). Never
// cached: the copies left change with every order.
//
// With "&preview" and a login (the "Preview (with your login)" button in the admin): the prints
// of every exhibition the account may see, also while the shop is closed ("preview": true), so
// prices can be checked before the shop opens. The page shows them with "Add to cart" disabled
// while the shop is closed.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getRole } from '@/access/roles'
import { errorJson, json } from '@/lib/http'
import { serverUrl } from '@/lib/site-identity'
import { findOffers, offersOf, type Offer } from '@/lib/shop/catalog'
import { getShopSettings } from '@/lib/shop/settings'
import { copiesLeft, countTaken } from '@/lib/shop/stock'
import { isSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = (url.searchParams.get('exhibition') || '').toLowerCase()

  if (!isSlug(slug)) {
    return errorJson('Invalid exhibition', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)
  const { user } = url.searchParams.has('preview') ? await payload.auth({ headers: request.headers }) : { user: null }
  const preview = Boolean(getRole(user))

  let offers: Offer[]

  if (preview) {
    const { docs } = await payload.find({
      collection: 'exhibitions',
      where: { slug: { equals: slug } },
      context: { tjSlug: slug },
      depth: 1,
      limit: 1,
      user,
      overrideAccess: false,
    })

    offers = docs[0] ? offersOf(docs[0], serverUrl(), { preview: true }) : []
  } else if (settings.enabled) {
    offers = [...(await findOffers(payload, [slug])).values()]
  } else {
    return json({ enabled: false, offers: [] })
  }

  const taken = await countTaken(
    payload,
    offers.map((offer) => offer.printId),
  )

  return json({
    enabled: settings.enabled,
    ...(preview ? { preview: true } : {}),
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
