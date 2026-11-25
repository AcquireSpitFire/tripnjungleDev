// POST /shop/withdrawal { name, orderNumber, email, statement }
// Withdrawal function of the website (Art. 11a Directive 2011/83/EU, since 19 June 2026): the buyer
// names the order and confirms; the order gets "Withdrawal received" and the buyer an
// acknowledgement of receipt by e-mail. The acknowledgement only goes to the address stored with
// the order, so the form cannot send e-mails to anybody else. Rate limited in src/proxy.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { sendWithdrawalEmails } from '@/lib/shop/emails'
import { cleanText, errorJson, isEmail, isSameOrigin, json, readJson } from '@/lib/shop/http'

export const dynamic = 'force-dynamic'

const NOT_FOUND =
  'We could not find an order with this number and e-mail address. Please check both, or send your withdrawal by e-mail (see the instructions below).'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorJson('Forbidden', 403)
  }

  const body = await readJson(request)

  if (!body) {
    return errorJson('Invalid request', 400)
  }

  const orderNumber = cleanText(body.orderNumber, 40).toUpperCase()
  const email = cleanText(body.email, 254).toLowerCase()
  const name = cleanText(body.name, 120)
  const statement = cleanText(body.statement, 2000)

  if (!name || !/^TJ-\d{4}-\d{5,}$/.test(orderNumber) || !isEmail(email)) {
    return errorJson('Please enter your name, the order number (e.g. TJ-2026-00012) and your e-mail address.', 400)
  }

  const payload = await getPayload({ config: configPromise })
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
    !['awaitingPayment', 'paid', 'shipped'].includes(order.status)
  ) {
    return errorJson(NOT_FOUND, 404)
  }

  const receivedAt = new Date()

  await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      withdrawalReceivedAt: receivedAt.toISOString(),
      withdrawalStatement: [name, statement].filter(Boolean).join(': '),
    },
  })

  try {
    await sendWithdrawalEmails(payload, { orderNumber, name, customerEmail: order.customerEmail, statement, receivedAt })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Withdrawal e-mail for ${orderNumber} failed` })

    return json({
      ok: true,
      received: receivedAt.toISOString(),
      note: 'Your withdrawal has been recorded, but the confirmation e-mail could not be sent. Please keep this page as proof.',
    })
  }

  return json({ ok: true, received: receivedAt.toISOString() })
}
