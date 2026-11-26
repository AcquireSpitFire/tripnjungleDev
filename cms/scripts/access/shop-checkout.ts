// Access checks – Shop – checkout (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkShopCheckout(t: Context): Promise<void> {
  const { payload, file, as, check } = t
  const {
    attempt,
    manager,
    originalSendEmail,
    plainImage,
    post,
    printId,
    repeat,
    sentMails,
    shopExhibition,
    shopImage,
    shopManager,
    shopRow,
  } = t.f

  // ---------- Shop: offers, quote, stock, checkout, webhook ----------
  console.log('Shop – checkout')

  const shopNow: AnyDoc = await payload.findByID({
    collection: 'exhibitions',
    id: shopExhibition.id,
    depth: 0,
    overrideAccess: true,
  })

  shopNow.gallery[0].prints.push({ label: 'No amount', pricing: 'fixed' })
  await payload.update({
    collection: 'exhibitions',
    id: shopExhibition.id,
    data: { gallery: shopNow.gallery },
    ...as(manager),
  })

  const requestPrintId: string = shopRow.prints[1].id
  const nonePrintId: string = shopRow.prints[2].id
  const { findOffers, offerKey, parseCartItems } = await import('../../src/lib/shop/catalog')
  const offers = await findOffers(payload, ['shop-one'])
  const photoId = String(shopImage.id)
  const offerA3 = offers.get(offerKey('shop-one', photoId, printId))

  check('visitors get the offer with the price of the exhibition', offerA3?.price === 120, offerA3)
  check('the print size is shown in cm', offerA3?.size === '30 × 40 cm', offerA3?.size)
  check(
    '"No price" prints are not offered',
    !offers.has(offerKey('shop-one', photoId, nonePrintId)),
  )
  check(
    'a fixed price without an amount is not offered',
    ![...offers.values()].some((offer) => offer.label === 'No amount'),
  )
  check(
    'a photo with only "No price" prints offers nothing',
    ![...offers.values()].some((offer) => offer.mediaId === String(plainImage.id)),
  )
  check(
    '"price on request" is offered',
    offers.get(offerKey('shop-one', photoId, requestPrintId))?.pricing === 'request',
  )
  check(
    'locked exhibitions offer no prints',
    (await findOffers(payload, ['locked-one'])).size === 0,
  )
  check(
    'malformed cart items are rejected',
    parseCartItems([{ exhibition: 'shop-one', photo: '1', print: '<x>' }]) === null,
  )
  check(
    'cart quantities are capped at 10',
    parseCartItems([{ exhibition: 'shop-one', photo: '1', print: 'abc', quantity: 999 }])?.[0]
      .quantity === 10,
  )

  process.env.STRIPE_SECRET_KEY = 'sk_test_access_check'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_access_check'

  await payload.updateGlobal({
    slug: 'site',
    data: {
      shopEnabled: true,
      vatMode: 'smallBusiness',
      shippingZones: [
        { name: 'Austria', price: 9.9, freeFrom: 500, countries: ['AT'], deliveryTime: '3–5 days' },
      ],
    },
    overrideAccess: true,
  })

  const { getShopSettings } = await import('../../src/lib/shop/settings')
  const { quoteCart } = await import('../../src/lib/shop/checkout')
  const { countTaken } = await import('../../src/lib/shop/stock')
  const shopSettings = await getShopSettings(payload)
  const cart = (print: string, quantity: number) => [
    { exhibition: 'shop-one', photo: photoId, print, quantity },
  ]

  check('the shop is open with Stripe keys and a shipping zone', shopSettings.enabled)
  check(
    'the small business note follows the country',
    shopSettings.vatNote.includes('§ 6 Abs. 1 Z 27 UStG'),
    shopSettings.vatNote,
  )

  // The shipped test order above holds 1 of the 2 copies
  const quote = await quoteCart(payload, shopSettings, cart(printId, 1), 'AT')

  check(
    'the quote uses the price of the exhibition and the shipping zone',
    quote.ok && quote.subtotal === 120 && quote.shipping === 9.9 && quote.total === 129.9,
    [quote.subtotal, quote.shipping, quote.total, quote.message],
  )
  check('shipped orders count as sold', quote.lines[0]?.left === 1, quote.lines[0]?.left)
  check(
    'more copies than left cannot be ordered',
    (await quoteCart(payload, shopSettings, cart(printId, 2), 'AT')).lines[0]?.problem ===
      'Only 1 copy left.',
  )
  check(
    'countries without a shipping zone cannot order',
    (await quoteCart(payload, shopSettings, cart(printId, 1), 'DE')).total === null,
  )
  check(
    '"price on request" cannot be ordered online',
    Boolean(
      (await quoteCart(payload, shopSettings, cart(requestPrintId, 1), 'AT')).lines[0]?.problem,
    ),
  )
  check(
    '"No price" prints in a cart are dropped as missing',
    (await quoteCart(payload, shopSettings, cart(nonePrintId, 1), 'AT')).missing.length === 1,
  )

  const makeOrder = (status: string, minutes?: number) =>
    payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: {
        status: status as 'pending',
        expiresAt:
          minutes === undefined ? undefined : new Date(Date.now() + minutes * 60_000).toISOString(),
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

  await makeOrder('pending', -1)
  await makeOrder('cancelled')
  await makeOrder('refunded')
  check(
    'expired, cancelled and refunded orders hold no copies',
    (await countTaken(payload, [printId])).get(printId) === 1,
  )

  await makeOrder('pending', 30)
  check(
    'a running checkout holds the last copy',
    (await quoteCart(payload, shopSettings, cart(printId, 1), 'AT')).lines[0]?.problem ===
      'Sold out.',
  )

  // Stripe webhook: only signed events; paid → status, buyer, address, e-mails once
  sentMails.length = 0

  const { default: StripeSdk } = await import('stripe')
  const { POST: stripeWebhook } = await import('../../src/app/shop/webhook/route')
  const webhookOrder: AnyDoc = await makeOrder('pending', 30)
  const sessionAddress = {
    line1: 'Teststraße 1',
    line2: null,
    postal_code: '1010',
    city: 'Wien',
    state: null,
    country: 'AT',
  }
  const eventBody = JSON.stringify({
    id: 'evt_access_check',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_access_check',
        object: 'checkout.session',
        client_reference_id: String(webhookOrder.id),
        metadata: { orderId: String(webhookOrder.id) },
        payment_status: 'paid',
        amount_total: 12990,
        payment_intent: 'pi_access_check',
        customer_details: {
          email: 'buyer@test.local',
          name: 'Buyer',
          phone: null,
          address: sessionAddress,
        },
        collected_information: { shipping_details: { name: 'Buyer', address: sessionAddress } },
      },
    },
  })
  const signed = new StripeSdk('sk_test_access_check').webhooks.generateTestHeaderString({
    payload: eventBody,
    secret: 'whsec_access_check',
  })
  const webhookRequest = (signature: string) =>
    new Request('http://localhost:3000/shop/webhook', {
      method: 'POST',
      body: eventBody,
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    })

  check(
    'webhooks without a valid signature are rejected',
    (await stripeWebhook(webhookRequest('t=1,v1=forged'))).status === 400,
  )
  check(
    'a signed Stripe webhook is accepted',
    (await stripeWebhook(webhookRequest(signed))).status === 200,
  )

  const paidOrder: AnyDoc = await payload.findByID({
    collection: 'orders',
    id: webhookOrder.id,
    overrideAccess: true,
  })

  check(
    'the paid order gets status, number, buyer and shipping address',
    paidOrder.status === 'paid' &&
      /^TJ-\d{4}-\d{5}$/.test(paidOrder.orderNumber || '') &&
      paidOrder.customerEmail === 'buyer@test.local' &&
      paidOrder.shippingAddress?.city === 'Wien' &&
      paidOrder.confirmationSent === true,
    [
      paidOrder.status,
      paidOrder.orderNumber,
      paidOrder.customerEmail,
      paidOrder.shippingAddress?.city,
    ],
  )

  const mailsAfterFirst = sentMails.length

  check(
    'the buyer and the shop get an e-mail',
    mailsAfterFirst === 2,
    sentMails.map((mail) => mail.to),
  )
  check(
    'a repeated webhook is accepted',
    (await stripeWebhook(webhookRequest(signed))).status === 200,
  )
  check(
    'a repeated webhook sends no e-mails again',
    sentMails.length === mailsAfterFirst,
    sentMails.length,
  )

  // Paid after the copies were no longer held: noted for the shop
  const lateOrder: AnyDoc = await makeOrder('pending', -1)
  const lateBody = eventBody
    .replace(/evt_access_check/g, 'evt_access_late')
    .replace(/cs_test_access_check/g, 'cs_test_access_late')
    .replace(new RegExp(`"${webhookOrder.id}"`, 'g'), `"${lateOrder.id}"`)
  const lateResponse = await stripeWebhook(
    new Request('http://localhost:3000/shop/webhook', {
      method: 'POST',
      body: lateBody,
      headers: {
        'stripe-signature': new StripeSdk('sk_test_access_check').webhooks.generateTestHeaderString(
          {
            payload: lateBody,
            secret: 'whsec_access_check',
          },
        ),
        'content-type': 'application/json',
      },
    }),
  )
  const latePaid: AnyDoc = await payload.findByID({
    collection: 'orders',
    id: lateOrder.id,
    overrideAccess: true,
  })

  check(
    'a payment after the hold ran out is noted for the shop',
    lateResponse.status === 200 &&
      latePaid.status === 'paid' &&
      String(latePaid.internalNote).includes('no longer held'),
    [latePaid.status, latePaid.internalNote],
  )

  payload.sendEmail = originalSendEmail

  // Shop routes: same origin only, rate limited
  const { POST: quoteRoute } = await import('../../src/app/shop/quote/route')
  const quoteRequest = (origin?: string) =>
    quoteRoute(
      new Request('http://localhost:3000/shop/quote', {
        method: 'POST',
        body: JSON.stringify({ items: cart(printId, 1), country: 'AT' }),
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      }),
    )

  check(
    'shop requests from other websites are refused',
    (await quoteRequest('https://evil.example')).status === 403,
  )
  check('shop requests without an Origin are refused', (await quoteRequest()).status === 403)
  check(
    'shop requests from the site itself are answered',
    (await quoteRequest('http://localhost:3000')).status === 200,
  )

  const { GET: offersRoute } = await import('../../src/app/shop/offers/route')
  const offersResponse = await offersRoute(
    new Request('http://localhost:3000/shop/offers?exhibition=shop-one'),
  )
  const offersJson = (await offersResponse.json()) as AnyDoc

  check(
    'the offers route lists the offered prints with copies left',
    offersJson.enabled === true &&
      offersJson.offers.length === 2 &&
      offersJson.offers.find((offer: AnyDoc) => offer.print === printId)?.left === 0,
    offersJson,
  )
  check(
    'the offers route is never cached',
    (offersResponse.headers.get('cache-control') || '').includes('no-store'),
  )

  const requestStatuses = await repeat(6, () => post('/shop/request', '203.0.113.20'))
  const checkoutStatuses = await repeat(11, () => post('/shop/checkout', '203.0.113.21'))

  check(
    'the 6th price request per address is blocked (429)',
    requestStatuses[5] === 429 && requestStatuses[4] !== 429,
    requestStatuses,
  )
  check(
    'the 11th checkout per address is blocked (429)',
    checkoutStatuses[10] === 429 && checkoutStatuses[9] !== 429,
    checkoutStatuses,
  )
  check('the shop limits do not block the login', (await attempt('203.0.113.21')) !== 429)

  // Running checkouts per connection, release when coming back from Stripe (src/lib/shop/hold.ts)
  const { holdCopies } = await import('../../src/lib/shop/checkout')
  const { holdKeyFor, releaseValue } = await import('../../src/lib/shop/hold')
  const holdImage: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'H', rightsConfirmed: true },
    file: file(),
    ...as(manager),
  })
  const holdExhibition: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'hold-one',
      title: 'Hold',
      visibility: 'public',
      release: 'scheduled',
      gallery: [
        {
          file: holdImage.id,
          name: 'Edition',
          prints: [
            { label: 'Limited', pricing: 'fixed', price: 50, copies: 10 },
            { label: 'Open', pricing: 'fixed', price: 40 },
          ],
        },
      ],
    },
    ...as(manager),
  })
  const [limitedPrint, openPrint] = holdExhibition.gallery[0].prints.map(
    (print: AnyDoc) => print.id,
  )
  const holdCart = (print: string) => [
    { exhibition: 'hold-one', photo: String(holdImage.id), print, quantity: 1 },
  ]
  const connection = holdKeyFor(payload.secret, '203.0.113.30')
  const hold = (print: string, key = connection): Promise<AnyDoc> =>
    holdCopies(payload, shopSettings, holdCart(print), 'AT', key)
  const firstHold = await hold(limitedPrint)
  const secondHold = await hold(limitedPrint)
  const thirdHold = await hold(limitedPrint)

  check(
    'two running checkouts with limited copies per connection are allowed',
    Boolean(firstHold.order && secondHold.order),
  )
  check(
    'a third one from the same connection is refused',
    !thirdHold.order && String(thirdHold.error).includes('two unfinished'),
    thirdHold.error,
  )
  check(
    'another connection can still buy',
    Boolean((await hold(limitedPrint, holdKeyFor(payload.secret, '203.0.113.31'))).order),
  )
  check('open editions are not limited per connection', Boolean((await hold(openPrint)).order))
  check(
    'the connection is stored only as an anonymous key, not readable through the API',
    firstHold.order.holdKey === connection &&
      !connection.includes('203.0.113') &&
      (await payload.findByID({ collection: 'orders', id: firstHold.order.id, ...as(shopManager) }))
        .holdKey === undefined,
  )

  const { POST: releaseRoute } = await import('../../src/app/shop/checkout/release/route')
  const release = (value: string) =>
    releaseRoute(
      new Request('http://localhost:3000/shop/checkout/release', {
        method: 'POST',
        body: JSON.stringify({ release: value }),
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      }),
    )
  const firstValue = releaseValue(payload.secret, firstHold.order.id)

  check(
    'a release with a wrong token is refused (403)',
    (await release(`${firstHold.order.id}.${'0'.repeat(32)}`)).status === 403,
  )
  check(
    'the token of one checkout does not release another one',
    (await release(firstValue.replace(/^\d+/, String(secondHold.order.id)))).status === 403,
  )

  const releasedJson = (await (await release(firstValue)).json()) as AnyDoc
  const releasedOrder: AnyDoc = await payload.findByID({
    collection: 'orders',
    id: firstHold.order.id,
    overrideAccess: true,
  })

  check(
    'coming back from Stripe releases the copies at once',
    releasedJson.released === true &&
      releasedOrder.status === 'cancelled' &&
      !releasedOrder.holdKey,
    [releasedJson, releasedOrder.status, releasedOrder.holdKey],
  )
  check('the connection can start a checkout again', Boolean((await hold(limitedPrint)).order))
  check(
    'a checkout cannot be released twice',
    ((await (await release(firstValue)).json()) as AnyDoc).released === false,
  )

  Object.assign(t.f, {
    requestPrintId,
    nonePrintId,
    photoId,
    paidOrder,
    offersRoute,
    holdExhibition,
  })
}
