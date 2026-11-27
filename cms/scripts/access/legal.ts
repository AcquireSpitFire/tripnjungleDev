// Access checks – Legal (run by scripts/check-access.ts): e-mail required for the shop, product
// safety details, withdrawal function on every page and without JavaScript, customs notice,
// contact point and report link, texts
import type { AnyDoc, Context, SentMail } from './context'

export async function checkLegal(t: Context): Promise<void> {
  const { payload, check } = t
  const { paidOrder, photoId, printId } = t.f

  console.log('Legal')

  const text = (load: Promise<Response>) => load.then((response) => response.text())

  // The shop only opens with e-mail sending
  const { getShopSettings, shopStatus } = await import('../../src/lib/shop/settings')
  const smtp = process.env.SMTP_HOST

  delete process.env.SMTP_HOST

  const withoutMail = await getShopSettings(payload)
  const mailItem = shopStatus(withoutMail.site).items.find((item) =>
    item.label.startsWith('E-mail sending'),
  )

  process.env.SMTP_HOST = smtp

  check(
    'without e-mail sending the shop stays closed',
    !withoutMail.enabled && mailItem?.required === true,
  )

  // Product safety: manufacturer (default: the operator of the legal notice)
  await payload.updateGlobal({
    slug: 'site',
    data: {
      operatorName: 'Tom Test',
      operatorStreet: 'Teststraße 1',
      operatorCity: '1010 Wien',
      operatorCountry: 'Austria',
      operatorEmail: 'tom@test.local',
      jurisdiction: 'at',
      businessPurpose: '',
      shippingZones: [
        { name: 'Austria', price: 9.9, countries: ['AT'], deliveryTime: '3–5 days' },
        { name: 'Switzerland', price: 19.9, countries: ['CH'], deliveryTime: '5–8 days' },
      ],
    },
    overrideAccess: true,
  })

  const settings = await getShopSettings(payload)

  check(
    'the manufacturer defaults to the operator with postal and e-mail address',
    settings.manufacturer.includes('Tom Test') &&
      settings.manufacturer.includes('1010 Wien') &&
      settings.manufacturer.includes('tom@test.local'),
    settings.manufacturer,
  )

  const offersJson: AnyDoc = await (
    await (
      await import('../../src/app/shop/offers/route')
    ).GET(new Request('http://localhost:3000/shop/offers?exhibition=shop-one'))
  ).json()

  check(
    'the prints come with manufacturer and the VAT/shipping note for the teaser',
    String(offersJson.manufacturer).includes('Tom Test') &&
      String(offersJson.priceNote).includes('plus shipping'),
    [offersJson.manufacturer, offersJson.priceNote],
  )

  // Customs notice outside the EU
  const { quoteCart } = await import('../../src/lib/shop/checkout')
  const cart = [{ exhibition: 'shop-one', photo: photoId, print: printId, quantity: 1 }]
  const swiss = await quoteCart(payload, settings, cart, 'CH')
  const austrian = await quoteCart(payload, settings, cart, 'AT')

  check(
    'deliveries outside the EU mention import duties, inside the EU not',
    swiss.customsNote.includes('import duties') && austrian.customsNote === '',
    [swiss.customsNote, austrian.customsNote],
  )
  check(
    'the shop status warns about shipping outside the EU',
    shopStatus(settings.site).items.some(
      (item) => item.label === 'Shipping only within the EU' && !item.ok,
    ),
  )

  // Order confirmation: manufacturer and the withdrawal function
  const mails: SentMail[] = []
  const originalSendEmail = payload.sendEmail

  payload.sendEmail = (async (message: AnyDoc) => {
    mails.push(message)
  }) as typeof payload.sendEmail

  const { sendOrderConfirmation } = await import('../../src/lib/shop/emails')

  await sendOrderConfirmation(payload, { ...paidOrder, customerEmail: 'buyer@test.local' })

  const confirmation = mails.find((mail) => mail.subject.startsWith('Your order'))

  check(
    'the order confirmation names the manufacturer and links the withdrawal function',
    Boolean(
      confirmation?.text.includes('Manufacturer:') && confirmation.text.includes('/withdrawal'),
    ),
  )

  // Withdrawal function: a link on every page, and the form also works without JavaScript
  const { renderTemplate } = await import('../../src/lib/render-template')

  check(
    'every page links "Withdraw from contract here"',
    renderTemplate('about.html', { title: 'x' }).includes('>Withdraw from contract here</a>') &&
      renderTemplate('exhibition.html', { title: 'x' }).includes(
        '>Withdraw from contract here</a>',
      ),
  )

  const { POST: withdrawalPage } = await import('../../src/app/withdrawal/route')
  const formPost = (fields: Record<string, string>, origin = 'http://localhost:3000') =>
    withdrawalPage(
      new Request('http://localhost:3000/withdrawal', {
        method: 'POST',
        headers: { origin },
        body: new URLSearchParams(fields),
      }),
    )
  const accepted = await text(
    formPost({
      name: 'Buyer',
      orderNumber: paidOrder.orderNumber,
      email: 'buyer@test.local',
      statement: 'No JS.',
    }),
  )

  check('the withdrawal form works without JavaScript', accepted.includes('was received on'))
  check(
    'a wrong order number shows the error on the page',
    (
      await text(
        formPost({ name: 'Buyer', orderNumber: 'TJ-2026-99999', email: 'buyer@test.local' }),
      )
    ).includes('could not find an order'),
  )
  check(
    'the form post only from our own pages',
    (
      await formPost(
        { name: 'B', orderNumber: paidOrder.orderNumber, email: 'buyer@test.local' },
        'https://evil.example',
      )
    ).status === 403,
  )

  // Thanks page: the order number, never cached
  const { GET: thanks } = await import('../../src/app/order/thanks/route')
  const thanksResponse = await thanks(
    new Request(`http://localhost:3000/order/thanks?session_id=${paidOrder.stripeSessionId}`),
  )
  const thanksHtml = await thanksResponse.text()

  check(
    'the thanks page shows the order number and is not cached',
    thanksHtml.includes(paidOrder.orderNumber) &&
      (thanksResponse.headers.get('cache-control') || '').includes('no-store'),
  )

  // Delayed payment (SEPA): acknowledgement of the order right away
  mails.length = 0

  const { default: StripeSdk } = await import('stripe')
  const { POST: stripeWebhook } = await import('../../src/app/shop/webhook/route')
  const delayed: AnyDoc = await payload.create({
    collection: 'orders',
    overrideAccess: true,
    data: {
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      items: [
        {
          printId,
          quantity: 1,
          exhibitionSlug: 'shop-one',
          photoName: 'Sunset',
          unitPrice: 120,
          lineTotal: 120,
        },
      ],
      subtotal: 120,
      shippingCost: 9.9,
      total: 129.9,
    },
  })
  const address = {
    line1: 'Teststraße 1',
    line2: null,
    postal_code: '1010',
    city: 'Wien',
    state: null,
    country: 'AT',
  }
  const body = JSON.stringify({
    id: 'evt_access_delayed',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_access_delayed',
        object: 'checkout.session',
        client_reference_id: String(delayed.id),
        metadata: { orderId: String(delayed.id) },
        payment_status: 'unpaid',
        amount_total: 12990,
        payment_intent: 'pi_access_delayed',
        customer_details: { email: 'sepa@test.local', name: 'Sepa', phone: null, address },
        collected_information: { shipping_details: { name: 'Sepa', address } },
      },
    },
  })

  await stripeWebhook(
    new Request('http://localhost:3000/shop/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': new StripeSdk('sk_test_access_check').webhooks.generateTestHeaderString(
          {
            payload: body,
            secret: 'whsec_access_check',
          },
        ),
        'content-type': 'application/json',
      },
    }),
  )

  const delayedNow: AnyDoc = await payload.findByID({
    collection: 'orders',
    id: delayed.id,
    overrideAccess: true,
  })

  check(
    'a delayed payment gets an acknowledgement of the order at once',
    delayedNow.status === 'awaitingPayment' &&
      mails.some(
        (mail) => mail.to === 'sepa@test.local' && mail.subject.includes('payment pending'),
      ),
    [delayedNow.status, mails.map((mail) => mail.subject)],
  )

  payload.sendEmail = originalSendEmail

  // Legal notice: contact point (DSA) and the default business purpose; report link on photo pages
  const imprint = await text((await import('../../src/app/imprint/route')).GET())

  check(
    'the legal notice has the contact point and how to report illegal content',
    imprint.includes('Contact point and reporting illegal content') &&
      imprint.includes('tom@test.local'),
  )
  check(
    'the business purpose names the sale of prints by default',
    imprint.includes('sale of photo prints'),
    imprint.match(/Impressum · [^<]*|Business purpose.{0,200}/g),
  )

  const { GET: photoPage } = await import('../../src/app/exhibition/[slug]/photo/[photo]/route')
  const photoHtml = await text(
    photoPage(new Request(`http://localhost:3000/exhibition/shop-one/photo/${photoId}`), {
      params: Promise.resolve({ slug: 'shop-one', photo: String(photoId) }),
    }),
  )

  check(
    'photo pages have a "Report this content" e-mail link',
    photoHtml.includes('Report this content') &&
      photoHtml.includes('mailto:tom@test.local?subject='),
  )

  // Texts
  const { currentContributorTerms } = await import('../../src/lib/contributor-terms')
  const { createLocalReq } = await import('payload')
  const terms = await currentContributorTerms(await createLocalReq({}, payload))
  const { termsText } = await import('../../src/lib/shop/legal')

  check(
    'contributor terms: responsibility for the account only if at fault, rights to adapt, DSA reasons',
    terms.text.includes('if you are at fault') &&
      !terms.text.includes('unless you are not at fault') &&
      terms.text.includes('watermark') &&
      terms.text.includes('Digital Services Act'),
  )
  check(
    'the terms treat colour differences as a note, not as an excluded defect',
    !termsText(settings.site).includes('not a defect'),
  )

  await payload.updateGlobal({
    slug: 'site',
    data: { mailProviderName: 'Mail Inc.', mailProviderOutsideEu: true },
    overrideAccess: true,
  })

  const privacy = await text((await import('../../src/app/privacy/route')).GET())

  check(
    'the privacy policy names the parcel service, the abuse protection and the e-mail transfer',
    privacy.includes('parcel service') &&
      privacy.includes('working memory') &&
      privacy.includes('outside the EU/EEA; the transfer'),
  )

  // Back to one zone for the areas after this one
  await payload.updateGlobal({
    slug: 'site',
    data: {
      shippingZones: [
        { name: 'Austria', price: 9.9, freeFrom: 500, countries: ['AT'], deliveryTime: '3–5 days' },
      ],
    },
    overrideAccess: true,
  })
}
