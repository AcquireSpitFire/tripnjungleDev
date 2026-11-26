// Access checks – Shop – e-mail (run by scripts/check-access.ts)
import type { AnyDoc, Context, SentMail } from './context'

export async function checkShopEmail(t: Context): Promise<void> {
  const { payload, as, check, fails } = t
  const {
    acceptTerms,
    artistUser,
    editor,
    getTerms,
    manager,
    managerWithoutSection,
    shopExhibition,
    shopManager,
    testOrder,
  } = t.f

  // ---------- Shop: e-mails (captured instead of sent) ----------
  console.log('Shop – e-mail')

  const sentMails: SentMail[] = []
  const originalSendEmail = payload.sendEmail.bind(payload)

  payload.sendEmail = (async (message: SentMail) => {
    sentMails.push(message)
  }) as typeof payload.sendEmail

  await payload.updateGlobal({
    slug: 'site',
    data: { operatorName: 'Tom Test', operatorEmail: 'shop-owner@test.local', jurisdiction: 'at' },
    overrideAccess: true,
  })

  // The standard contributor terms name the operator: a new name is a new text
  check(
    'a changed text of the contributor terms has to be accepted again',
    (await getTerms(manager)).accepted === false,
  )
  await fails('until then, a manager cannot change exhibitions', () =>
    payload.update({
      collection: 'exhibitions',
      id: shopExhibition.id,
      data: { title: 'Shop' },
      ...as(manager),
    }),
  )

  for (const user of [manager, managerWithoutSection, editor, artistUser, shopManager]) {
    await acceptTerms(user)
  }

  check(
    'after accepting the new text, the manager can change exhibitions again',
    (await getTerms(manager)).accepted === true,
  )

  const shipped: AnyDoc = await payload.update({
    collection: 'orders',
    id: testOrder.id,
    data: {
      status: 'shipped',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example/TRACK123',
    },
    ...as(shopManager),
  })
  const shippedMail = sentMails.find((mail) => mail.subject.includes('has been shipped'))

  check('"Shipped" stamps the shipping date', Boolean(shipped.shippedAt), shipped.shippedAt)
  check(
    '"Shipped" e-mails the buyer with the tracking details',
    shippedMail?.to === 'buyer@test.local' && shippedMail.text.includes('TRACK123'),
    shippedMail?.subject,
  )

  sentMails.length = 0
  await payload.update({
    collection: 'orders',
    id: testOrder.id,
    data: { internalNote: 'packed' },
    ...as(shopManager),
  })
  check(
    'saving a shipped order again sends no second e-mail',
    sentMails.length === 0,
    sentMails.length,
  )

  const { sendOrderConfirmation } = await import('../../src/lib/shop/emails')

  await sendOrderConfirmation(payload, {
    id: 1,
    orderNumber: 'TJ-2026-00002',
    customerEmail: 'buyer@test.local',
    customerName: '<b>Buyer</b>',
    items: [
      {
        photoName: '<script>alert(1)</script>',
        printLabel: 'A3',
        quantity: 1,
        unitPrice: 120,
        lineTotal: 120,
      },
    ],
    subtotal: 120,
    shippingCost: 9.9,
    total: 129.9,
    vatNote: 'No VAT charged',
  })

  const confirmation = sentMails.find((mail) => mail.subject.includes('TJ-2026-00002'))

  check(
    'the order confirmation escapes values from the order',
    Boolean(confirmation) && !confirmation!.html.includes('<script>'),
  )
  check(
    'the order confirmation contains the withdrawal instructions and the terms',
    Boolean(
      confirmation?.text.includes('RIGHT OF WITHDRAWAL') &&
      confirmation.text.includes('TERMS AND CONDITIONS'),
    ),
  )
  check(
    'replies to the confirmation go to the shop',
    confirmation?.replyTo === 'shop-owner@test.local',
    confirmation?.replyTo,
  )

  Object.assign(t.f, { sentMails, originalSendEmail })
}
