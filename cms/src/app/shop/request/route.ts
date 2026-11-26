// POST /shop/request { exhibition, photo, print, name, email, message, website }
// "Request price" for prints with "Price on request". Stored under Shop → Price requests and
// e-mailed to the shop address (Reply-To = the visitor). Nothing is sent to the visitor's address,
// so the form cannot be used to send e-mails to strangers. "website" is a hidden honeypot field:
// bots fill it, people do not. Rate limited per IP address in src/proxy.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { findOffers, offerKey } from '@/lib/shop/catalog'
import { sendPriceRequestEmail } from '@/lib/shop/emails'
import { shopPost } from '@/lib/shop/route'
import { cleanText, errorJson, isEmail, json } from '@/lib/http'
import { getShopSettings } from '@/lib/shop/settings'
import { isSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'

export const POST = shopPost(async (body) => {
  // Honeypot filled: pretend success, store nothing
  if (cleanText(body.website, 200)) {
    return json({ ok: true })
  }

  const exhibition = cleanText(body.exhibition, 100).toLowerCase()
  const photo = cleanText(typeof body.photo === 'number' ? String(body.photo) : body.photo, 64)
  const print = cleanText(body.print, 64)
  const name = cleanText(body.name, 120)
  const email = cleanText(body.email, 254)
  const message = cleanText(body.message, 2000)

  if (!isEmail(email)) {
    return errorJson('Please enter a valid e-mail address.', 400)
  }

  const payload = await getPayload({ config: configPromise })
  const settings = await getShopSettings(payload)

  if (!settings.enabled) {
    return errorJson('The shop is closed at the moment.', 503)
  }

  const offer = isSlug(exhibition)
    ? (await findOffers(payload, [exhibition])).get(offerKey(exhibition, photo, print))
    : undefined

  if (!offer || offer.pricing !== 'request') {
    return errorJson('This print is no longer available.', 404)
  }

  const saved = await payload.create({
    collection: 'price-requests',
    overrideAccess: true,
    data: {
      status: 'open',
      name,
      email,
      message,
      photoName: offer.photoName,
      printLabel: offer.label,
      exhibitionTitle: offer.exhibitionTitle,
      photoUrl: offer.photoUrl,
      exhibition: offer.exhibitionId,
      printId: offer.printId,
    },
  })

  try {
    await sendPriceRequestEmail(payload, {
      id: saved.id,
      name,
      email,
      message,
      photoName: offer.photoName,
      printLabel: offer.label,
      exhibitionTitle: offer.exhibitionTitle,
      photoUrl: offer.photoUrl,
    })
  } catch (error) {
    // The request is stored; the shop still finds it in the admin
    payload.logger.error({ err: error, msg: `Price request e-mail ${saved.id} failed` })
  }

  return json({ ok: true })
})
