// Who may hold how many copies, and how a buyer gives them back.
//
// Every checkout holds its copies for 35 minutes (src/lib/shop/checkout.ts). So that nobody can
// block a limited edition with endless unpaid checkouts, one connection may have at most
// MAX_OPEN_CHECKOUTS running checkouts that hold limited copies. The connection is stored only as
// an anonymous key ("holdKey" = HMAC of the address, src/lib/client-address.ts) and removed from
// the order as soon as the checkout ends (Orders → clearHoldKey).
//
// Going back from the Stripe page ("cancel_url") passes a release token: /cart then calls
// POST /shop/checkout/release and the copies are free right away instead of after 35 minutes.
import crypto from 'crypto'
import type { Payload } from 'payload'

import { withNote } from './order-note'
import { getStripe } from './settings'

export const MAX_OPEN_CHECKOUTS = 2

function hmac(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export function holdKeyFor(secret: string, address: string): string {
  return hmac(secret, 'hold:' + address)
}

// "<order id>.<token>" for the cancel_url
export function releaseValue(secret: string, orderId: number | string): string {
  return `${orderId}.${hmac(secret, 'release:' + orderId).slice(0, 32)}`
}

// The order id of a valid release value, otherwise null
export function parseReleaseValue(secret: string, value: unknown): number | null {
  const match = typeof value === 'string' ? /^(\d{1,10})\.([a-f0-9]{32})$/.exec(value) : null

  if (!match) {
    return null
  }

  const expected = Buffer.from(releaseValue(secret, match[1]))
  const given = Buffer.from(value as string)

  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
    ? Number(match[1])
    : null
}

// Ends a running checkout: the Stripe page is closed first (so it can no longer be paid), then
// the order is cancelled. If the buyer paid in the meantime, nothing happens – the webhook wins.
export async function releaseCheckout(payload: Payload, orderId: number): Promise<boolean> {
  const order = await payload
    .findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!order || order.status !== 'pending') {
    return false
  }

  if (order.stripeSessionId) {
    try {
      await getStripe().checkout.sessions.expire(order.stripeSessionId)
    } catch {
      // Already expired is fine; anything else (completed, Stripe unreachable) leaves the order
      const session = await getStripe()
        .checkout.sessions.retrieve(order.stripeSessionId)
        .catch(() => null)

      if (session?.status !== 'expired') {
        return false
      }
    }
  }

  await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      status: 'cancelled',
      internalNote: withNote(
        order,
        'The buyer went back from the payment page (copies free again).',
      ),
    },
  })

  return true
}
