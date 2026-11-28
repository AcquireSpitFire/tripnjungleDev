// Withdrawal function of the website (Art. 11a Directive 2011/83/EU, since 19 June 2026): the buyer
// names the order and confirms; the order gets "Withdrawal received" and the buyer an
// acknowledgement of receipt by e-mail. The acknowledgement only goes to the address stored with
// the order, so the form cannot send e-mails to anybody else.
//
// Used by POST /shop/withdrawal (JSON, public/js/withdrawal-form.js) and by POST /withdrawal (the
// same form without JavaScript). Both are rate limited in src/proxy.ts.
import type { Payload } from 'payload'

import { cleanText, isEmail } from '../http'
import { sendWithdrawalEmails } from './emails'
import { HOLDING_STATUSES } from './order-status'

export type WithdrawalResult =
  { ok: true; received: string; note?: string } | { ok: false; status: 400 | 404; error: string }

const NOT_FOUND =
  'We could not find an order with this number and e-mail address. Please check both, or send your withdrawal by e-mail (see the instructions below).'

export async function recordWithdrawal(
  payload: Payload,
  input: Record<string, unknown>,
): Promise<WithdrawalResult> {
  const orderNumber = cleanText(input.orderNumber, 40).toUpperCase()
  const email = cleanText(input.email, 254).toLowerCase()
  const name = cleanText(input.name, 120)
  const statement = cleanText(input.statement, 2000)

  if (!name || !/^TJ-\d{4}-\d{5,}$/.test(orderNumber) || !isEmail(email)) {
    return {
      ok: false,
      status: 400,
      error:
        'Please enter your name, the order number (e.g. TJ-2026-00012) and your e-mail address.',
    }
  }

  const { docs } = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const order = docs[0]

  if (
    !order?.customerEmail ||
    order.customerEmail.toLowerCase() !== email ||
    !HOLDING_STATUSES.includes(order.status)
  ) {
    return { ok: false, status: 404, error: NOT_FOUND }
  }

  const receivedAt = new Date()

  // The first withdrawal counts for the deadline; later ones are added below it, never replace it
  await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      withdrawalReceivedAt: order.withdrawalReceivedAt || receivedAt.toISOString(),
      withdrawalStatement: [
        order.withdrawalStatement,
        `${receivedAt.toISOString()}: ${[name, statement].filter(Boolean).join(': ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  })

  try {
    await sendWithdrawalEmails(payload, {
      orderNumber,
      name,
      customerEmail: order.customerEmail,
      statement,
      receivedAt,
    })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Withdrawal e-mail for ${orderNumber} failed` })

    return {
      ok: true,
      received: receivedAt.toISOString(),
      note: 'Your withdrawal has been recorded, but the confirmation e-mail could not be sent. Please keep this page as proof.',
    }
  }

  return { ok: true, received: receivedAt.toISOString() }
}
