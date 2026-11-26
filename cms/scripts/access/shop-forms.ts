// Access checks – Shop – forms and legal texts (run by scripts/check-access.ts)
import type { AnyDoc, Context, SentMail } from './context'

export async function checkShopForms(t: Context): Promise<void> {
  const { payload, as, check } = t
  const { nonePrintId, originalSendEmail, paidOrder, photoId, printId, requestPrintId, sentMails } = t.f

  // ---------- Shop: legal texts, price requests, withdrawal ----------
  console.log('Shop – forms and legal texts')

  sentMails.length = 0
  payload.sendEmail = (async (message: SentMail) => {
    sentMails.push(message)
  }) as typeof payload.sendEmail

  const { legalTextToHtml, defaultWithdrawalText } = await import('../../src/lib/shop/legal')
  const siteNow = await payload.findGlobal({ slug: 'site', overrideAccess: true })

  check('legal texts from the admin are escaped', !legalTextToHtml('## <script>x</script>\n\n<img onerror=x>').includes('<'.concat('script')))
  check(
    'the standard withdrawal text names the operator and the withdrawal function',
    defaultWithdrawalText(siteNow).includes('Tom Test') && defaultWithdrawalText(siteNow).includes('/withdrawal'),
  )

  const postJson = async (route: string, body: unknown) => {
    const module = route === 'request' ? await import('../../src/app/shop/request/route') : await import('../../src/app/shop/withdrawal/route')

    return module.POST(
      new Request(`http://localhost:3000/shop/${route}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      }),
    )
  }
  const priceRequest = (print: string, extra: Record<string, string> = {}) =>
    postJson('request', { exhibition: 'shop-one', photo: photoId, print, name: 'Ana', email: 'ana@test.local', message: 'How much?', ...extra })
  const countRequests = async () => (await payload.count({ collection: 'price-requests', overrideAccess: true })).totalDocs

  check('a price request for a print on request is accepted', (await priceRequest(requestPrintId)).status === 200)
  check('the price request is stored', (await countRequests()) === 1)

  const requestMail = sentMails.find((mail) => mail.subject.startsWith('Price request'))

  check(
    'the price request is e-mailed to the shop with Reply-To the visitor',
    requestMail?.to === 'shop-owner@test.local' && requestMail.replyTo === 'ana@test.local',
    [requestMail?.to, requestMail?.replyTo],
  )
  check('nothing is e-mailed to the visitor', !sentMails.some((mail) => mail.to === 'ana@test.local'))
  check('a price request for a fixed-price print is refused', (await priceRequest(printId)).status === 404)
  check('a price request for a "No price" print is refused', (await priceRequest(nonePrintId)).status === 404)
  check('a price request with an invalid e-mail is refused', (await priceRequest(requestPrintId, { email: 'nope' })).status === 400)
  check('bots filling the honeypot get "ok" but nothing is stored', (await priceRequest(requestPrintId, { website: 'spam' })).status === 200 && (await countRequests()) === 1)

  sentMails.length = 0

  const withdraw = (email: string) =>
    postJson('withdrawal', { name: 'Buyer', orderNumber: paidOrder.orderNumber.toLowerCase(), email, statement: 'I withdraw.' })

  check('a withdrawal with the wrong e-mail is refused', (await withdraw('someone@test.local')).status === 404)
  check('a refused withdrawal sends no e-mail', sentMails.length === 0, sentMails.length)
  check('a withdrawal with order number and e-mail is accepted', (await withdraw('BUYER@test.local')).status === 200)

  const withdrawn: AnyDoc = await payload.findByID({ collection: 'orders', id: paidOrder.id, overrideAccess: true })

  check('the order shows the withdrawal', Boolean(withdrawn.withdrawalReceivedAt) && withdrawn.withdrawalStatement.includes('I withdraw.'))

  await postJson('withdrawal', { name: 'Buyer', orderNumber: paidOrder.orderNumber, email: 'buyer@test.local', statement: 'Second note.' })

  const withdrawnTwice: AnyDoc = await payload.findByID({ collection: 'orders', id: paidOrder.id, overrideAccess: true })

  check(
    'a second withdrawal is added and keeps the date of the first',
    withdrawnTwice.withdrawalReceivedAt === withdrawn.withdrawalReceivedAt &&
      withdrawnTwice.withdrawalStatement.includes('I withdraw.') &&
      withdrawnTwice.withdrawalStatement.includes('Second note.'),
    withdrawnTwice.withdrawalStatement,
  )
  check(
    'the acknowledgement goes to the address of the order, a note to the shop',
    sentMails.some((mail) => mail.to === 'buyer@test.local' && mail.subject.startsWith('Acknowledgement')) &&
      sentMails.some((mail) => mail.to === 'shop-owner@test.local'),
    sentMails.map((mail) => mail.to),
  )

  payload.sendEmail = originalSendEmail
}
