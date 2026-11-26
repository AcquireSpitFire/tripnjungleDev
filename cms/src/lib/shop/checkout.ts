// Cart → price → Stripe Checkout.
//
// quoteCart:      what the cart page shows: every item with its current details, copies left,
//                 shipping for the chosen country, totals and VAT. Nothing is reserved.
// createCheckout: the same calculation inside the stock lock, then an order "pending" that holds
//                 the copies, then the Stripe Checkout session (hosted payment page). The webhook
//                 (webhook.ts) completes the order once Stripe reports the payment. At most
//                 MAX_OPEN_CHECKOUTS running checkouts with limited copies per connection (hold.ts).
import type { Payload } from 'payload'

import type { Order } from '../../payload-types'
import { SITE_NAME } from '../site-identity'
import { findOffers, offerKey, type CartItemInput, type Offer } from './catalog'
import { countryName } from './countries'
import {
  CURRENCY,
  containedVat,
  getStripe,
  roundMoney,
  shippingCost,
  shippingCountries,
  toCents,
  zoneFor,
  type ShopSettings,
} from './settings'
import { MAX_OPEN_CHECKOUTS, releaseValue } from './hold'
import { copiesLeft, countTaken, withStockLock } from './stock'

// Stripe allows 30 minutes at least. The copies are held a little longer than the payment page
// is open, so a payment in the last second never meets a copy that was sold again.
const CHECKOUT_MINUTES = 30
const HOLD_MINUTES = 35

export type QuoteLine = Omit<Offer, 'exhibitionId' | 'copies'> & {
  quantity: number
  left: number | null
  lineTotal: number
  problem: string | null
}

export type Quote = {
  lines: QuoteLine[]
  // Cart items that no longer exist (removed, locked, set to "No price")
  missing: string[]
  country: string | null
  countryName: string
  countries: { code: string; name: string }[]
  zone: string | null
  deliveryTime: string
  subtotal: number
  shipping: number | null
  total: number | null
  vatNote: string
  vatAmount: number
  ok: boolean
  message: string | null
}

export type CheckoutResult = { url: string } | { error: string; quote: Quote }

// TJ-2026-00012: year of the order and its id
export function formatOrderNumber(id: number | string, createdAt?: string | null): string {
  const year = (createdAt ? new Date(createdAt) : new Date()).getFullYear()

  return `TJ-${year}-${String(id).padStart(5, '0')}`
}

async function buildQuote(
  payload: Payload,
  settings: ShopSettings,
  items: CartItemInput[],
  country: string | null,
): Promise<{ quote: Quote; offers: Map<string, Offer> }> {
  const offers = await findOffers(
    payload,
    items.map((item) => item.exhibition),
  )
  const keyOf = (item: CartItemInput) => offerKey(item.exhibition, item.photo, item.print)
  const found = items.filter((item) => offers.has(keyOf(item)))
  const taken = await countTaken(
    payload,
    found.map((item) => offers.get(keyOf(item))!.printId),
  )

  const lines: QuoteLine[] = found.map((item) => {
    const offer = offers.get(keyOf(item))!
    const left = copiesLeft(offer, taken)
    let problem: string | null = null

    if (offer.pricing !== 'fixed' || offer.price === null) {
      problem = 'Price on request – this print cannot be ordered online.'
    } else if (left !== null && left < 1) {
      problem = 'Sold out.'
    } else if (left !== null && item.quantity > left) {
      problem = left === 1 ? 'Only 1 copy left.' : `Only ${left} copies left.`
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { exhibitionId, copies, ...visible } = offer

    return { ...visible, quantity: item.quantity, left, lineTotal: roundMoney((offer.price ?? 0) * item.quantity), problem }
  })

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  const zone = country ? zoneFor(settings, country) : null
  const shipping = zone ? shippingCost(zone, subtotal) : null
  const total = shipping === null ? null : roundMoney(subtotal + shipping)

  let message: string | null = null

  if (!settings.enabled) {
    message = 'The shop is closed at the moment.'
  } else if (!lines.length) {
    message = 'Your cart is empty.'
  } else if (!country) {
    message = 'Choose the country of delivery.'
  } else if (!zone) {
    message = 'Sorry, we do not ship to this country.'
  } else if (lines.some((line) => line.problem)) {
    message = 'Please check the marked items.'
  }

  return {
    offers,
    quote: {
      lines,
      missing: items.filter((item) => !offers.has(keyOf(item))).map(keyOf),
      country: zone ? country : null,
      countryName: country ? countryName(country) : '',
      countries: shippingCountries(settings),
      zone: zone?.name ?? null,
      deliveryTime: zone?.deliveryTime ?? '',
      subtotal,
      shipping,
      total,
      vatNote: settings.vatNote,
      vatAmount: total === null ? 0 : containedVat(settings, total),
      ok: message === null,
      message,
    },
  }
}

export async function quoteCart(
  payload: Payload,
  settings: ShopSettings,
  items: CartItemInput[],
  country: string | null,
): Promise<Quote> {
  return (await buildQuote(payload, settings, items, country)).quote
}

async function openCheckoutsOf(payload: Payload, holdKey: string): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'orders',
    where: {
      and: [
        { holdKey: { equals: holdKey } },
        { status: { equals: 'pending' } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    overrideAccess: true,
  })

  return totalDocs
}

// Count, check and hold the copies: one checkout at a time. "holdKey" is the anonymous key of the
// buyer's connection (hold.ts); exported for the checks in scripts/check-access.ts.
export async function holdCopies(
  payload: Payload,
  settings: ShopSettings,
  items: CartItemInput[],
  country: string,
  holdKey: string,
): Promise<{ order: Order; quote: Quote } | { error: string; quote: Quote }> {
  return withStockLock(async () => {
    const { quote, offers } = await buildQuote(payload, settings, items, country)

    if (!quote.ok || quote.total === null || quote.shipping === null || quote.missing.length) {
      return { error: quote.message || 'Some items are no longer available.', quote }
    }

    // Only limited editions can be blocked; open editions never run out
    const holdsLimitedCopies = quote.lines.some((line) => line.left !== null)

    if (holdsLimitedCopies && (await openCheckoutsOf(payload, holdKey)) >= MAX_OPEN_CHECKOUTS) {
      return {
        error:
          'There are already two unfinished payments from your connection. Complete one of them, go back from the payment page to cancel it, or try again in half an hour.',
        quote,
      }
    }

    const order = await payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: {
        status: 'pending',
        holdKey: holdsLimitedCopies ? holdKey : null,
        expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
        items: quote.lines.map((line) => ({
          photoName: line.photoName,
          artistName: line.artistName,
          exhibitionTitle: line.exhibitionTitle,
          printLabel: line.label,
          size: line.size,
          material: line.material,
          details: line.details,
          quantity: line.quantity,
          unitPrice: line.price ?? 0,
          lineTotal: line.lineTotal,
          exhibition: offers.get(line.key)?.exhibitionId,
          exhibitionSlug: line.exhibitionSlug,
          mediaId: line.mediaId,
          printId: line.printId,
        })),
        subtotal: quote.subtotal,
        shippingCost: quote.shipping,
        total: quote.total,
        vatNote: quote.vatNote,
        vatAmount: quote.vatAmount,
        shippingZone: `${quote.zone} (${quote.countryName})`,
        deliveryTime: quote.deliveryTime,
      },
    })

    const numbered = await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      data: { orderNumber: formatOrderNumber(order.id, order.createdAt) },
    })

    return { order: numbered, quote }
  })
}

export async function createCheckout(
  payload: Payload,
  settings: ShopSettings,
  items: CartItemInput[],
  country: string,
  base: string,
  holdKey: string,
): Promise<CheckoutResult> {
  const held = await holdCopies(payload, settings, items, country, holdKey)

  if ('error' in held) {
    return held
  }

  const { order, quote } = held
  const orderNumber = order.orderNumber || formatOrderNumber(order.id, order.createdAt)
  const seller = settings.site.operatorName?.trim() || SITE_NAME

  // The Stripe session is created outside the lock: the copies are already held by the order
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: String(order.id),
        metadata: { orderId: String(order.id), orderNumber },
        payment_intent_data: {
          metadata: { orderId: String(order.id), orderNumber },
          description: `${orderNumber} – ${SITE_NAME} prints`,
        },
        line_items: quote.lines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency: CURRENCY,
            unit_amount: toCents(line.price ?? 0),
            product_data: {
              name: `${line.photoName} – ${line.label}`.slice(0, 250),
              description:
                [line.size, line.material, line.artistName ? 'by ' + line.artistName : '', line.details]
                  .filter(Boolean)
                  .join(' · ')
                  .slice(0, 500) || undefined,
              // Stripe shows the image on its page; it must be reachable publicly over https
              images: line.thumbUrl.startsWith('https://') ? [line.thumbUrl] : undefined,
            },
          },
        })),
        // Only the country the shipping cost was calculated for
        shipping_address_collection: { allowed_countries: [country] },
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: `Shipping ${quote.countryName}${quote.deliveryTime ? ' (' + quote.deliveryTime + ')' : ''}`.slice(0, 100),
              fixed_amount: { amount: toCents(quote.shipping ?? 0), currency: CURRENCY },
            },
          },
        ],
        billing_address_collection: 'required',
        locale: 'auto',
        submit_type: 'pay',
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60 + 30,
        custom_text: {
          submit: {
            message: `By clicking “Pay” you place a binding order with ${seller} under our terms (${base}/terms). Right of withdrawal: ${base}/withdrawal. ${quote.vatNote}.`.slice(
              0,
              1200,
            ),
          },
        },
        success_url: `${base}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
        // Back to the cart; the release value lets it give the held copies back at once
        cancel_url: `${base}/cart?released=${releaseValue(payload.secret, order.id)}`,
      },
      // A retry of the same request never creates a second session for the order
      { idempotencyKey: `checkout-order-${order.id}` },
    )

    if (!session.url) {
      throw new Error('Stripe returned no checkout URL')
    }

    await payload.update({
      collection: 'orders',
      id: order.id,
      overrideAccess: true,
      data: { stripeSessionId: session.id },
    })

    return { url: session.url }
  } catch (error) {
    // Free the copies again
    payload.logger.error({ err: error, msg: `Stripe checkout for order ${orderNumber} failed` })
    await payload
      .update({
        collection: 'orders',
        id: order.id,
        overrideAccess: true,
        data: { status: 'cancelled', internalNote: 'The Stripe payment page could not be opened.' },
      })
      .catch(() => undefined)

    return { error: 'The payment page could not be opened. Please try again in a moment.', quote }
  }
}
