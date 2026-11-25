// E-mails of the shop, sent through Payload's e-mail adapter (SMTP, src/payload.config.ts).
// Every value from an order or a visitor is escaped in the HTML part; the plain-text part carries
// the same content. The order confirmation contains the whole contract: items, prices, address,
// seller, terms and the instructions on withdrawal (durable medium, § 312f BGB / § 7 FAGG).
import type { Payload } from 'payload'

import { escapeHtml } from '../render-template'
import { countryName } from './countries'
import { legalTextToHtml, legalTextToPlain, termsText, withdrawalText } from './legal'
import { formatMoney, getShopSettings, type ShopSettings } from './settings'

const SITE = 'Tripnjungle'

type Address = {
  name?: string | null
  line1?: string | null
  line2?: string | null
  postalCode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
} | null

export type OrderMailItem = {
  photoName?: string | null
  artistName?: string | null
  exhibitionTitle?: string | null
  printLabel?: string | null
  size?: string | null
  material?: string | null
  details?: string | null
  quantity?: number | null
  unitPrice?: number | null
  lineTotal?: number | null
}

// The fields of an order the e-mails use (src/collections/Orders.ts)
export type OrderMailDoc = {
  id: number | string
  orderNumber?: string | null
  customerName?: string | null
  customerEmail?: string | null
  items?: OrderMailItem[] | null
  subtotal?: number | null
  shippingCost?: number | null
  total?: number | null
  vatNote?: string | null
  vatAmount?: number | null
  deliveryTime?: string | null
  shippingAddress?: Address
  trackingNumber?: string | null
  trackingUrl?: string | null
}

type Message = { to: string; subject: string; lines: string[]; html?: string; replyTo?: string }

function serverUrl(): string {
  return (process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')
}

// ---------- Building blocks ----------

function addressLines(address: Address | undefined): string[] {
  if (!address) {
    return []
  }

  return [
    address.name,
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.state,
    countryName(address.country),
  ]
    .map((line) => (line || '').trim())
    .filter(Boolean)
}

function itemLines(item: OrderMailItem): string[] {
  return [
    `${item.quantity ?? 1} × ${item.photoName || 'Photo'}${item.artistName ? ' by ' + item.artistName : ''}`,
    [item.printLabel, item.size, item.material].filter(Boolean).join(' · '),
    item.details || '',
    item.exhibitionTitle ? 'Exhibition: ' + item.exhibitionTitle : '',
    `${formatMoney(item.unitPrice ?? 0)} each – ${formatMoney(item.lineTotal ?? 0)}`,
  ].filter(Boolean)
}

function totalsLines(order: OrderMailDoc): string[] {
  return [
    `Items: ${formatMoney(order.subtotal ?? 0)}`,
    `Shipping: ${formatMoney(order.shippingCost ?? 0)}`,
    `Total: ${formatMoney(order.total ?? 0)}`,
    order.vatAmount ? `${order.vatNote}: ${formatMoney(order.vatAmount)}` : order.vatNote || '',
  ].filter(Boolean)
}

function sellerLines(settings: ShopSettings): string[] {
  const site = settings.site

  return [site.operatorName, site.operatorStreet, site.operatorCity, site.operatorCountry, site.operatorEmail]
    .map((line) => (line || '').trim())
    .filter(Boolean)
}

function paragraph(lines: string[]): string {
  return `<p>${lines.map(escapeHtml).join('<br>')}</p>`
}

function layout(body: string): string {
  const url = serverUrl()

  return `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:640px;margin:0 auto;padding:16px">${body}<p style="color:#666;font-size:13px;margin-top:32px">${escapeHtml(SITE)} · <a href="${escapeHtml(url)}">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a></p></body></html>`
}

// Blank lines in "lines" separate paragraphs in the HTML part
async function send(payload: Payload, message: Message): Promise<void> {
  const blocks: string[][] = [[]]

  for (const line of message.lines) {
    if (line === '') {
      blocks.push([])
    } else {
      blocks[blocks.length - 1].push(line)
    }
  }

  await payload.sendEmail({
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.lines.join('\n'),
    html: layout(message.html ?? blocks.filter((block) => block.length).map(paragraph).join('\n')),
  })
}

// ---------- The e-mails ----------

// To the buyer, right after the payment
export async function sendOrderConfirmation(payload: Payload, order: OrderMailDoc): Promise<void> {
  if (!order.customerEmail) {
    return
  }

  const settings = await getShopSettings(payload)
  const terms = termsText(settings.site)
  const withdrawal = withdrawalText(settings.site)
  const items = order.items || []
  const address = addressLines(order.shippingAddress)
  const intro = `Thank you for your order${order.customerName ? ', ' + order.customerName : ''}! We have received your payment and will ship your prints as soon as possible.`
  const summary = [
    `Order ${order.orderNumber}`,
    '',
    ...items.flatMap((item) => [...itemLines(item), '']),
    ...totalsLines(order),
    '',
    ...(order.deliveryTime ? ['Delivery time: ' + order.deliveryTime, ''] : []),
    ...(address.length ? ['Shipping to:', ...address, ''] : []),
    'Seller:',
    ...sellerLines(settings),
    '',
    'You will get another e-mail when your order has been shipped.',
  ]

  await send(payload, {
    to: order.customerEmail,
    replyTo: settings.shopEmail || undefined,
    subject: `Your order ${order.orderNumber} at ${SITE}`,
    lines: [
      intro,
      '',
      ...summary,
      '',
      '----------------------------------------',
      legalTextToPlain(withdrawal),
      '',
      '----------------------------------------',
      'TERMS AND CONDITIONS',
      '',
      legalTextToPlain(terms),
    ],
    html: [
      paragraph([intro]),
      summary
        .join('\n')
        .split('\n\n')
        .map((block) => paragraph(block.split('\n')))
        .join('\n'),
      '<hr>',
      legalTextToHtml(withdrawal),
      '<hr>',
      '<h2>Terms and conditions</h2>',
      legalTextToHtml(terms),
    ].join('\n'),
  })
}

// To the shop: a new paid order
export async function sendOrderNotification(payload: Payload, order: OrderMailDoc): Promise<void> {
  const settings = await getShopSettings(payload)

  if (!settings.shopEmail) {
    return
  }

  await send(payload, {
    to: settings.shopEmail,
    replyTo: order.customerEmail || undefined,
    subject: `New order ${order.orderNumber} (${formatMoney(order.total ?? 0)})`,
    lines: [
      `New paid order ${order.orderNumber}`,
      '',
      ...(order.items || []).flatMap((item) => [...itemLines(item), '']),
      ...totalsLines(order),
      '',
      'Buyer: ' + [order.customerName, order.customerEmail].filter(Boolean).join(', '),
      ...addressLines(order.shippingAddress),
      '',
      `Open in the admin: ${serverUrl()}/admin/collections/orders/${order.id}`,
    ],
  })
}

// To the buyer, when the status is set to "Shipped" (src/collections/Orders.ts)
export async function sendShippedEmail(payload: Payload, order: OrderMailDoc): Promise<void> {
  if (!order.customerEmail) {
    return
  }

  const settings = await getShopSettings(payload)
  const trackingUrl = order.trackingUrl && /^https:\/\/\S+$/.test(order.trackingUrl) ? order.trackingUrl : ''

  await send(payload, {
    to: order.customerEmail,
    replyTo: settings.shopEmail || undefined,
    subject: `Your order ${order.orderNumber} has been shipped`,
    lines: [
      `Good news${order.customerName ? ', ' + order.customerName : ''}: your order ${order.orderNumber} is on its way.`,
      '',
      ...(order.items || []).map((item) => `${item.quantity ?? 1} × ${item.photoName || 'Photo'} – ${item.printLabel || ''}`),
      '',
      ...(order.trackingNumber ? ['Tracking number: ' + order.trackingNumber] : []),
      ...(trackingUrl ? ['Track your parcel: ' + trackingUrl] : []),
      '',
      `Thank you for supporting ${SITE}!`,
    ],
  })
}

// To the shop: a visitor asks for the price of a print
export async function sendPriceRequestEmail(
  payload: Payload,
  request: {
    id: number | string
    name: string
    email: string
    message: string
    photoName: string
    printLabel: string
    exhibitionTitle: string
    photoUrl: string
  },
): Promise<void> {
  const settings = await getShopSettings(payload)

  if (!settings.shopEmail) {
    return
  }

  await send(payload, {
    to: settings.shopEmail,
    replyTo: request.email,
    subject: `Price request: ${request.photoName} (${request.printLabel})`,
    lines: [
      `Price request for “${request.photoName}” – ${request.printLabel}`,
      'Exhibition: ' + request.exhibitionTitle,
      'Photo: ' + request.photoUrl,
      '',
      'From: ' + [request.name, request.email].filter(Boolean).join(', '),
      '',
      request.message || '(no message)',
      '',
      `Reply to this e-mail to answer. Admin: ${serverUrl()}/admin/collections/price-requests/${request.id}`,
    ],
  })
}

// Withdrawal through the website (Art. 11a Directive 2011/83/EU): acknowledgement of receipt to
// the buyer (only to the address stored with the order) and a note to the shop
export async function sendWithdrawalEmails(
  payload: Payload,
  withdrawal: { orderNumber: string; name: string; customerEmail: string; statement: string; receivedAt: Date },
): Promise<void> {
  const settings = await getShopSettings(payload)
  const when = withdrawal.receivedAt.toLocaleString('en-GB', { timeZone: 'Europe/Vienna' }) + ' (Vienna time)'
  const details = [
    'Received on: ' + when,
    'Name: ' + withdrawal.name,
    ...(withdrawal.statement ? ['Statement: ' + withdrawal.statement] : []),
  ]

  await send(payload, {
    to: withdrawal.customerEmail,
    replyTo: settings.shopEmail || undefined,
    subject: `Acknowledgement of your withdrawal – order ${withdrawal.orderNumber}`,
    lines: [
      `We have received your withdrawal from the contract ${withdrawal.orderNumber}.`,
      '',
      ...details,
      '',
      'Please send the goods back within 14 days to:',
      ...sellerLines(settings),
      '',
      'We will refund the payment as described in the instructions on withdrawal.',
    ],
  })

  if (settings.shopEmail) {
    await send(payload, {
      to: settings.shopEmail,
      replyTo: withdrawal.customerEmail,
      subject: `Withdrawal: order ${withdrawal.orderNumber}`,
      lines: [`Withdrawal from order ${withdrawal.orderNumber}.`, '', ...details, 'E-mail: ' + withdrawal.customerEmail],
    })
  }
}
