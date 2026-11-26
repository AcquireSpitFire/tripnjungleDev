// Access checks – Shop – model (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkShopModel(t: Context): Promise<void> {
  const { payload, file, as, check, fails } = t
  const { acceptTerms, admin, editor, manager } = t.f

  // ---------- Shop: model and access ----------
  console.log('Shop – model')

  const shopImage: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'S', rightsConfirmed: true }, file: file(), ...as(manager) })
  const plainImage: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'N', rightsConfirmed: true }, file: file(), ...as(manager) })
  const shopExhibition: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'shop-one',
      title: 'Shop',
      visibility: 'public',
      release: 'scheduled',
      editors: [editor.id],
      gallery: [
        {
          file: shopImage.id,
          name: 'Sunset',
          prints: [
            { label: 'A3 print', width: 30, height: 40, material: 'Rag paper', pricing: 'fixed', price: 120, copies: 2 },
            { label: 'Large', pricing: 'request' },
            { label: 'Not yet', pricing: 'none' },
          ],
        },
        { file: plainImage.id, name: 'Just shown', prints: [{ label: 'Hidden', pricing: 'none' }] },
      ],
    },
    ...as(manager),
  })
  const shopRow = shopExhibition.gallery[0]
  const printId: string = shopRow.prints[0].id

  check('an exhibition manager can offer prints', shopRow.prints?.length === 3, shopRow.prints?.length)
  check('"No price" is a valid choice', shopRow.prints[2].pricing === 'none')

  const editedShop: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: shopExhibition.id,
    data: {
      gallery: [
        {
          id: shopRow.id,
          file: shopImage.id,
          name: 'Sunset 2',
          prints: [{ id: printId, label: 'A3 print', pricing: 'fixed', price: 1, copies: 999 }],
        },
        { id: shopExhibition.gallery[1].id, file: plainImage.id, name: 'Just shown' },
      ],
    },
    ...as(editor),
  })

  check(
    'an editor cannot change prints, prices or copies',
    editedShop.gallery[0].prints?.length === 3 &&
      editedShop.gallery[0].prints[0].price === 120 &&
      editedShop.gallery[0].prints[0].copies === 2,
    editedShop.gallery[0].prints,
  )
  check('an editor can still change the caption of a photo for sale', editedShop.gallery[0].name === 'Sunset 2')

  const swapError = await payload
    .update({
      collection: 'exhibitions',
      id: shopExhibition.id,
      data: {
        gallery: [
          { id: shopRow.id, file: plainImage.id, name: 'Swapped' },
          { id: shopExhibition.gallery[1].id, file: plainImage.id, name: 'Just shown' },
        ],
      },
      ...as(editor),
    })
    .then(() => 'no error')
    .catch((error: Error) => JSON.stringify((error as AnyDoc).data ?? error.message))

  check('an editor cannot put another photo into an item with prints', swapError.includes('only a manager can replace'), swapError)

  const visitorShop: AnyDoc = (
    await payload.find({ collection: 'exhibitions', where: { slug: { equals: 'shop-one' } }, overrideAccess: false })
  ).docs[0]

  check('visitors see the prints of a public exhibition', visitorShop?.gallery?.[0]?.prints?.[0]?.price === 120)
  check('visitors do not see the watermark choice of an exhibition', visitorShop?.watermark === undefined)

  const shopManager: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'shop@test.local', password: 'shop-password-123', role: 'manager', sections: ['shop'] },
    ...as(admin),
  })

  // Accepted terms, so the check below shows that the section decides
  await acceptTerms(shopManager)
  const testOrder: AnyDoc = await payload.create({
    collection: 'orders',
    overrideAccess: true,
    data: {
      status: 'paid',
      orderNumber: 'TJ-2026-00001',
      customerEmail: 'buyer@test.local',
      items: [{ printId, quantity: 1, exhibitionSlug: 'shop-one', photoName: 'Sunset', unitPrice: 120, lineTotal: 120 }],
      subtotal: 120,
      shippingCost: 9.9,
      total: 129.9,
    },
  })

  await fails('visitors cannot read orders', () => payload.find({ collection: 'orders', overrideAccess: false }))
  await fails('an exhibition manager cannot read orders', () => payload.find({ collection: 'orders', ...as(manager) }))
  await fails('an editor cannot read price requests', () => payload.find({ collection: 'price-requests', ...as(editor) }))
  await fails('nobody creates orders through the API', () =>
    payload.create({ collection: 'orders', data: { status: 'paid', total: 1 }, ...as(admin) }),
  )
  await fails('nobody creates price requests through the API', () =>
    payload.create({ collection: 'price-requests', data: { email: 'x@test.local', status: 'open' }, ...as(admin) }),
  )

  const shopManagerOrders = await payload.find({ collection: 'orders', ...as(shopManager) })

  check('a shop manager sees the orders', shopManagerOrders.totalDocs === 1, shopManagerOrders.totalDocs)

  const statusChanged: AnyDoc = await payload.update({
    collection: 'orders',
    id: testOrder.id,
    data: { status: 'cancelled', total: 1, customerEmail: 'x@evil.example', orderNumber: 'TJ-0' },
    ...as(shopManager),
  })

  check(
    'a shop manager changes the status but not amounts, buyer or number',
    statusChanged.status === 'cancelled' &&
      statusChanged.total === 129.9 &&
      statusChanged.customerEmail === 'buyer@test.local' &&
      statusChanged.orderNumber === 'TJ-2026-00001',
    [statusChanged.status, statusChanged.total, statusChanged.customerEmail, statusChanged.orderNumber],
  )
  await fails('a shop manager cannot delete orders', () =>
    payload.delete({ collection: 'orders', id: testOrder.id, ...as(shopManager) }),
  )
  await fails('a shop manager cannot change exhibitions', () =>
    payload.update({ collection: 'exhibitions', id: shopExhibition.id, data: { title: 'x' }, ...as(shopManager) }),
  )

  const forcedForSale: AnyDoc = await payload.update({
    collection: 'media',
    id: plainImage.id,
    data: { forSale: true, watermarkKey: 'forged' },
    ...as(manager),
  })

  check('"forSale" and the watermark key cannot be set through the API', !forcedForSale.forSale && !forcedForSale.watermarkKey)

  Object.assign(t.f, { shopImage, plainImage, shopExhibition, shopRow, printId, shopManager, testOrder })
}
