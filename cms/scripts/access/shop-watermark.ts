// Access checks – Shop – watermark (run by scripts/check-access.ts)
import fs from 'fs'
import path from 'path'

import type { AnyDoc, Context } from './context'

export async function checkShopWatermark(t: Context): Promise<void> {
  const { payload, sharp, file, as, check, fails } = t
  const {
    Media,
    createLocalReq,
    editor,
    holdExhibition,
    manager,
    plainImage,
    shopImage,
    uploadAs,
  } = t.f

  // ---------- Shop: watermark on photos for sale ----------
  console.log('Shop – watermark')

  const bigJpeg = await sharp({
    create: { width: 1400, height: 1000, channels: 3, background: '#357' },
  })
    .jpeg()
    .toBuffer()
  const wmPhoto: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'For sale', rightsConfirmed: true },
    file: { data: bigJpeg, mimetype: 'image/jpeg', name: 'for-sale.jpg', size: bigJpeg.length },
    ...as(manager),
  })
  const wmExhibition: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'wm-one',
      title: 'Watermark',
      visibility: 'public',
      gallery: [{ file: wmPhoto.id, prints: [{ label: 'A2', pricing: 'fixed', price: 200 }] }],
    },
    ...as(manager),
  })
  const reloadMedia = (id: number | string): Promise<AnyDoc> =>
    payload.findByID({ collection: 'media', id, overrideAccess: true })
  const visitorGallery = async (slug: string) =>
    (
      (
        await payload.find({
          collection: 'exhibitions',
          where: { slug: { equals: slug } },
          overrideAccess: false,
        })
      ).docs[0] as AnyDoc
    )?.gallery

  const wmPhotoNow = await reloadMedia(wmPhoto.id)
  const firstKey: string = wmPhotoNow.watermarkKey

  check(
    'a photo with a fixed price is for sale',
    wmPhotoNow.forSale === true && /^[a-f0-9]{12}$/.test(firstKey || ''),
    wmPhotoNow.forSale,
  )
  check(
    '"price on request" also makes a photo for sale',
    (await reloadMedia(shopImage.id)).forSale === true,
  )
  check(
    'a photo with only "No price" is not for sale',
    (await reloadMedia(plainImage.id)).forSale === false,
  )

  const wmGallery = await visitorGallery('wm-one')
  const shopGallery = await visitorGallery('shop-one')

  check(
    'visitors get watermarked URLs for photos for sale',
    String(wmGallery?.[0]?.file?.url).includes('/media-wm/') &&
      String(wmGallery?.[0]?.file?.sizes?.medium?.url).endsWith(
        `/media-wm/${wmPhoto.id}-${firstKey}-medium.webp`,
      ),
    wmGallery?.[0]?.file?.sizes?.medium?.url,
  )
  check(
    'photos with "No price" keep their plain URLs',
    String(shopGallery?.[1]?.file?.url).includes('/api/media/file/'),
    shopGallery?.[1]?.file?.url,
  )

  const managerView: AnyDoc = await payload.findByID({
    collection: 'media',
    id: wmPhoto.id,
    ...as(manager),
  })

  check(
    'logged-in accounts see the plain files',
    String(managerView.url).includes('/api/media/file/'),
    managerView.url,
  )

  const { Media: MediaCollection } = await import('../../src/collections/Media')
  const fileHandler = (MediaCollection.upload as AnyDoc).handlers[0]
  const handlerRequest = async (user: AnyDoc) => {
    const req = await createLocalReq({ user: user || undefined }, payload)

    if (!user) {
      req.user = null
    }

    return req
  }
  const plainFile = wmPhotoNow.sizes.medium.filename
  const visitorPlain = await fileHandler(await handlerRequest(null), {
    doc: wmPhotoNow,
    params: { filename: plainFile },
  })
  const managerPlain = await fileHandler(await handlerRequest(manager), {
    doc: wmPhotoNow,
    params: { filename: plainFile },
  })

  check(
    'visitors cannot load the plain files of a photo for sale',
    visitorPlain?.status === 404,
    visitorPlain?.status,
  )
  check('managers can still load the plain files', managerPlain === undefined, managerPlain?.status)

  const { GET: watermarkRoute } = await import('../../src/app/media-wm/[file]/route')
  const getWatermarked = (file: string) =>
    watermarkRoute(new Request('http://localhost:3000/media-wm/' + file), {
      params: Promise.resolve({ file }),
    })
  const wmResponse = await getWatermarked(`${wmPhoto.id}-${firstKey}-medium.webp`)
  const wmBytes = Buffer.from(await wmResponse.arrayBuffer())
  const wmMeta = wmResponse.status === 200 ? await sharp(wmBytes).metadata() : null

  check(
    'the watermarked copy is a WebP of the web size',
    wmResponse.headers.get('content-type') === 'image/webp' && wmMeta?.width === 1280,
    [wmResponse.status, wmMeta?.width],
  )

  const plainStats = await sharp(path.join(process.env.MEDIA_DIR as string, plainFile)).stats()
  const markedStats = wmMeta ? await sharp(wmBytes).stats() : null

  check(
    'the watermark changes the photo',
    Boolean(markedStats) &&
      Math.abs(markedStats!.channels[0].max - plainStats.channels[0].max) > 20,
    [plainStats.channels[0].max, markedStats?.channels[0].max],
  )
  check('a watermarked copy has no EXIF data', !wmMeta?.exif)
  check(
    'a wrong key gives 404',
    (await getWatermarked(`${wmPhoto.id}-000000000000-medium.webp`)).status === 404,
  )
  check(
    'a photo not for sale gives 404',
    (await getWatermarked(`${plainImage.id}-${firstKey}-medium.webp`)).status === 404,
  )
  check('invalid names give 404', (await getWatermarked('../../tripnjungle.db')).status === 404)

  const logoPng = await sharp({
    create: {
      width: 300,
      height: 100,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.8 },
    },
  })
    .png()
    .toBuffer()
  const logo: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Logo', rightsConfirmed: true },
    file: { data: logoPng, mimetype: 'image/png', name: 'logo.png', size: logoPng.length },
    ...as(manager),
  })

  await payload.update({
    collection: 'exhibitions',
    id: wmExhibition.id,
    data: { watermark: logo.id },
    ...as(manager),
  })

  const overrideKey: string = (await reloadMedia(wmPhoto.id)).watermarkKey

  check(
    'an exhibition watermark gives a new key',
    overrideKey !== firstKey && /^[a-f0-9]{12}$/.test(overrideKey),
    overrideKey,
  )
  check('the watermark image itself stays locked', (await reloadMedia(logo.id)).locked === true)
  check(
    'the copy with the exhibition watermark is made',
    (await getWatermarked(`${wmPhoto.id}-${overrideKey}-thumb.webp`)).status === 200,
  )

  // One rule for the key and the file: only exhibitions that OFFER the photo choose its watermark
  const { watermarkSourceId } = await import('../../src/lib/watermark')
  const sells = { pricing: 'fixed', price: 10 }

  check(
    'an exhibition that only shows a photo does not choose its watermark',
    watermarkSourceId(
      5,
      [
        { id: 1, watermark: 77, gallery: [{ file: 5, prints: [] }] },
        { id: 2, watermark: null, gallery: [{ file: 5, prints: [sells] }] },
      ] as AnyDoc,
      99,
    ) === 99,
  )
  check(
    'the selling exhibition with the lowest id and an own watermark wins',
    watermarkSourceId(
      5,
      [
        { id: 3, watermark: 88, gallery: [{ file: 5, prints: [{ pricing: 'request' }] }] },
        { id: 2, watermark: 66, gallery: [{ file: 5, prints: [sells] }] },
      ] as AnyDoc,
      99,
    ) === 66,
  )

  // Watermark images are only changed by managers (even an own, locked upload)
  const editorLogo: AnyDoc = await uploadAs(editor)

  check(
    'an editor can change an own locked upload that is not a watermark',
    Boolean(
      await payload.update({
        collection: 'media',
        id: editorLogo.id,
        data: { alt: 'Mine' },
        ...as(editor),
      }),
    ),
  )

  await payload.update({
    collection: 'exhibitions',
    id: holdExhibition.id,
    data: { watermark: editorLogo.id },
    ...as(manager),
  })
  await fails('an editor cannot change an upload once it is used as a watermark', () =>
    payload.update({
      collection: 'media',
      id: editorLogo.id,
      data: { alt: 'Changed' },
      ...as(editor),
    }),
  )
  await fails('an editor cannot delete an upload used as a watermark', () =>
    payload.delete({ collection: 'media', id: editorLogo.id, ...as(editor) }),
  )
  check(
    'a manager can still change a watermark image',
    Boolean(
      await payload.update({
        collection: 'media',
        id: editorLogo.id,
        data: { alt: 'Logo E' },
        ...as(manager),
      }),
    ),
  )

  await payload.updateGlobal({
    slug: 'site',
    data: { watermarkOpacity: 30, watermarkPosition: 'tiled' },
    overrideAccess: true,
  })

  const siteKey: string = (await reloadMedia(wmPhoto.id)).watermarkKey

  check('changing the watermark settings gives new keys', siteKey !== overrideKey, siteKey)
  check(
    'old watermarked files are removed when new ones are made',
    (await getWatermarked(`${wmPhoto.id}-${siteKey}-thumb.webp`)).status === 200 &&
      !fs.existsSync(
        path.join(
          process.env.MEDIA_DIR as string,
          'watermarked',
          `${wmPhoto.id}-${overrideKey}-thumb.webp`,
        ),
      ),
  )

  const wmRows: AnyDoc = (
    await payload.findByID({
      collection: 'exhibitions',
      id: wmExhibition.id,
      depth: 0,
      overrideAccess: true,
    })
  ).gallery

  wmRows[0].prints[0].pricing = 'none'
  await payload.update({
    collection: 'exhibitions',
    id: wmExhibition.id,
    data: { gallery: wmRows },
    ...as(manager),
  })

  const backToPlain = await reloadMedia(wmPhoto.id)

  check(
    'back to "No price" removes the watermark',
    backToPlain.forSale === false && !backToPlain.watermarkKey,
  )
  check(
    'and visitors get the plain URLs again',
    String((await visitorGallery('wm-one'))?.[0]?.file?.url).includes('/api/media/file/'),
  )
}
