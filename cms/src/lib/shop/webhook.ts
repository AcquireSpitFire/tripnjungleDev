// Stripe webhook events → order status. The route (src/app/shop/webhook/route.ts) checks the
// signature first; only signed events from Stripe get here.
//
//   checkout.session.completed               paid → "paid" + e-mails;
//                                            delayed method (SEPA …) → "awaitingPayment"
//   checkout.session.async_payment_succeeded → "paid" + e-mails
//   checkout.session.async_payment_failed    → "cancelled" (copies free again)
//   checkout.session.expired                 → "cancelled" if it was still "pending"
//
// Stripe repeats events until it gets a 2xx and may deliver them twice or out of order:
// every step checks the current status first, and the e-mails go out once ("confirmationSent").
import type { Payload } from 'payload'
import type Stripe from 'stripe'

import type { Order } from '../../payload-types'
import { formatOrderNumber } from './checkout'
import { sendOrderConfirmation, sendOrderNotification, sendOrderReceived } from './emails'
import { withNote } from './order-note'
import { toCents } from './settings'

type Session = Stripe.Checkout.Session

async function findOrder(payload: Payload, session: Session): Promise<Order | null> {
  const bySession = await payload.find({
    collection: 'orders',
    where: { stripeSessionId: { equals: session.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (bySession.docs[0]) {
    return bySession.docs[0]
  }

  // The session id is stored right after creating the session; if that write failed,
  // the order id in the metadata still finds it
  const id = Number(session.metadata?.orderId || session.client_reference_id)

  if (!Number.isInteger(id) || id <= 0) {
    return null
  }

  return payload
    .findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
    .catch(() => null)
}

function address(source: Stripe.Address | null | undefined, name: string | null | undefined) {
  return {
    name: name || '',
    line1: source?.line1 || '',
    line2: source?.line2 || '',
    postalCode: source?.postal_code || '',
    city: source?.city || '',
    state: source?.state || '',
    country: source?.country || '',
  }
}

function customerData(session: Session) {
  const customer = session.customer_details
  const shipping = session.collected_information?.shipping_details

  return {
    customerName: shipping?.name || customer?.name || '',
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || '',
    shippingAddress: address(shipping?.address, shipping?.name || customer?.name),
    billingAddress: address(customer?.address, customer?.name),
    stripeSessionId: session.id,
    stripePaymentIntent:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || '',
  }
}

async function update(payload: Payload, order: Order, data: Partial<Order>): Promise<Order> {
  return payload.update({ collection: 'orders', id: order.id, overrideAccess: true, data })
}

async function sendMails(payload: Payload, order: Order): Promise<void> {
  // Marked first: if Stripe repeats the event while the mail server is slow, nobody gets the
  // e-mails twice. A failed confirmation is noted for the shop to send by hand.
  await update(payload, order, { confirmationSent: true })

  try {
    await sendOrderConfirmation(payload, order)
  } catch (error) {
    payload.logger.error({ err: error, msg: `Order confirmation for ${order.orderNumber} failed` })
    await update(payload, order, {
      confirmationSent: false,
      internalNote: withNote(
        order,
        'The order confirmation e-mail could not be sent – send it by hand.',
      ),
    })
  }

  await sendOrderNotification(payload, order).catch((error) =>
    payload.logger.error({ err: error, msg: `Shop notification for ${order.orderNumber} failed` }),
  )
}

async function markPaid(payload: Payload, order: Order, session: Session): Promise<void> {
  if (order.status === 'paid' || order.status === 'shipped' || order.status === 'refunded') {
    if (!order.confirmationSent) {
      await sendMails(payload, order)
    }

    return
  }

  const warnings: string[] = []

  if (order.status === 'cancelled') {
    warnings.push(
      'Payment arrived for an order that was already cancelled/expired – check the copies left before shipping.',
    )
  } else if (
    order.status === 'pending' &&
    order.expiresAt &&
    new Date(order.expiresAt).getTime() < Date.now()
  ) {
    // The copies were no longer held: somebody else may have bought the last one meanwhile
    warnings.push(
      'Paid after the copies were no longer held – check the copies left before shipping.',
    )
  }

  if (
    typeof session.amount_total === 'number' &&
    session.amount_total !== toCents(order.total ?? 0)
  ) {
    warnings.push(
      `Amount paid (${session.amount_total / 100} EUR) differs from the order total (${order.total} EUR).`,
    )
  }

  const paid = await update(payload, order, {
    ...customerData(session),
    orderNumber: order.orderNumber || formatOrderNumber(order.id, order.createdAt),
    status: 'paid',
    paidAt: new Date().toISOString(),
    ...(warnings.length ? { internalNote: withNote(order, warnings.join(' ')) } : {}),
  })

  await sendMails(payload, paid)
}

export async function handleStripeEvent(payload: Payload, event: Stripe.Event): Promise<void> {
  if (!event.type.startsWith('checkout.session.')) {
    return
  }

  const session = event.data.object as Session
  const order = await findOrder(payload, session)

  if (!order) {
    payload.logger.warn(`Stripe event ${event.type} for an unknown session ${session.id}`)
    return
  }

  switch (event.type) {
    case 'checkout.session.completed':
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        await markPaid(payload, order, session)
      } else if (order.status === 'pending' || order.status === 'cancelled') {
        // Delayed payment method: the copies stay held until Stripe reports the outcome; the
        // buyer gets an acknowledgement of the order right away (only once: the status changes)
        const received = await update(payload, order, {
          ...customerData(session),
          orderNumber: order.orderNumber || formatOrderNumber(order.id, order.createdAt),
          status: 'awaitingPayment',
        })

        await sendOrderReceived(payload, received).catch((error) =>
          payload.logger.error({
            err: error,
            msg: `Acknowledgement for ${order.orderNumber} failed`,
          }),
        )
      }
      break

    case 'checkout.session.async_payment_succeeded':
      await markPaid(payload, order, session)
      break

    case 'checkout.session.async_payment_failed':
      if (order.status === 'awaitingPayment' || order.status === 'pending') {
        await update(payload, order, {
          status: 'cancelled',
          internalNote: withNote(order, 'Payment failed (Stripe).'),
        })
      }
      break

    case 'checkout.session.expired':
      if (order.status === 'pending') {
        await update(payload, order, {
          status: 'cancelled',
          internalNote: withNote(order, 'Checkout expired without payment.'),
        })
      }
      break
  }
}
