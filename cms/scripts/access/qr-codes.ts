// Access checks – QR codes (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkQrCodes(t: Context): Promise<void> {
  const { payload, as, check } = t
  const { artistUser, createLocalReq, editor, imageA, locked, manager, portrait } = t.f

  console.log('QR codes')

  const { exhibitionQrEndpoint } = await import('../../src/endpoints/exhibition-qr')
  const { PDFDocument } = await import('pdf-lib')

  const qr = async (user: AnyDoc, exhibitionId: number | string, query: string) => {
    const req = await createLocalReq(
      {
        user: user || undefined,
        urlSuffix: `/api/exhibitions/${exhibitionId}/qr?${query}`,
        req: { routeParams: { id: String(exhibitionId) } },
      },
      payload,
    )

    if (!user) {
      req.user = null
    }

    return exhibitionQrEndpoint.handler(req) as Promise<Response>
  }

  const allPdf = await qr(manager, locked.id, 'format=pdf')
  const allBytes = new Uint8Array(await allPdf.arrayBuffer())
  const allDoc = allPdf.status === 200 ? await PDFDocument.load(allBytes) : null

  check(
    'a manager gets the PDF of all photos',
    allPdf.headers.get('content-type') === 'application/pdf',
    allPdf.status,
  )
  check('the PDF has one label per photo', allDoc?.getPageCount() === 2, allDoc?.getPageCount())

  const [labelWidth, labelHeight] = allDoc
    ? [allDoc.getPage(0).getWidth(), allDoc.getPage(0).getHeight()]
    : [0, 0]

  check(
    'labels are A6 by default (105 × 148 mm)',
    Math.round(labelWidth) === 298 && Math.round(labelHeight) === 420,
    [labelWidth, labelHeight],
  )

  await payload.updateGlobal({
    slug: 'site',
    data: { qrFormat: 'square100' },
    overrideAccess: true,
  })

  const squarePdf = await qr(manager, locked.id, `format=pdf&media=${imageA.id}`)
  const squareDoc = await PDFDocument.load(new Uint8Array(await squarePdf.arrayBuffer()))

  check(
    'the label size follows the Site settings',
    Math.round(squareDoc.getPage(0).getWidth()) === 283,
    squareDoc.getPage(0).getWidth(),
  )
  check(
    'a single photo gives a single label',
    squareDoc.getPageCount() === 1,
    squareDoc.getPageCount(),
  )

  const qrImage = await qr(editor, locked.id, `format=png&media=${imageA.id}`)
  const pngBytes = new Uint8Array(await qrImage.arrayBuffer())

  check(
    'an assigned editor gets the QR image',
    qrImage.status === 200 && qrImage.headers.get('content-type') === 'image/png',
    qrImage.status,
  )
  check(
    'the QR image is a PNG',
    pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e,
  )
  check(
    'QR responses are not cached',
    (qrImage.headers.get('cache-control') || '').includes('no-store'),
  )
  check('visitors get no QR codes', (await qr(null, locked.id, 'format=pdf')).status === 401)
  check(
    'an artist gets no QR codes of other exhibitions',
    (await qr(artistUser, locked.id, 'format=pdf')).status === 404,
  )
  check(
    'photos outside the exhibition get no QR code',
    (await qr(manager, locked.id, `format=png&media=${portrait.id}`)).status === 404,
  )
  check(
    'invalid parameters are rejected',
    (await qr(manager, locked.id, 'format=svg')).status === 400,
  )

  const { photoShortUrl, isTemporaryAddress } = await import('../../src/lib/short-link')

  check(
    'the QR link is the short link /p/<id>',
    photoShortUrl('https://tripnjungle.com/', 42) === 'https://tripnjungle.com/p/42',
  )
  check('localhost counts as a temporary address', isTemporaryAddress('http://localhost:3000'))
  check(
    'Railway addresses count as temporary',
    isTemporaryAddress('https://tj-production.up.railway.app'),
  )
  check('the real domain is not temporary', !isTemporaryAddress('https://tripnjungle.com'))
}
