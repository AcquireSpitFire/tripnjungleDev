// Access checks – SEO (run by scripts/check-access.ts): robots, sitemap, server-rendered pages,
// titles, structured data – and that none of it shows what visitors may not see
import type { AnyDoc, Context } from './context'

export async function checkSeo(t: Context): Promise<void> {
  const { payload, check } = t
  const { imageA } = t.f

  console.log('SEO')

  const page = async (load: Promise<Response>) => (await load).text()

  // robots.txt: data and images open for rendering, the cart not blocked (it says noindex itself)
  const { GET: robots } = await import('../../src/app/robots.txt/route')
  const robotsText = await (await robots()).text()

  check(
    'robots.txt lets search engines load the exhibition data and the images',
    robotsText.includes('Allow: /api/exhibitions') &&
      robotsText.includes('Allow: /api/media/file/') &&
      robotsText.includes('Disallow: /api'),
    robotsText,
  )
  check('robots.txt does not block /cart (it carries noindex)', !robotsText.includes('/cart'))

  // Videos are no images
  const { imageUrl, centralEuropeanOffset } = await import('../../src/lib/seo')

  check(
    'a video gives no image address (og:image, JSON-LD, sitemap)',
    imageUrl({ mimeType: 'video/mp4', url: '/api/media/file/clip.mp4', sizes: {} } as AnyDoc) ===
      null,
  )
  check(
    'event times carry the Central European offset (winter/summer)',
    centralEuropeanOffset('2026-12-24', '19:00') === '+01:00' &&
      centralEuropeanOffset('2026-07-01', '19:00') === '+02:00',
  )

  // Sitemap: legal pages, photo pages with their image, no 100 cap
  const { GET: sitemap } = await import('../../src/app/sitemap.xml/route')
  const sitemapXml = await (await sitemap()).text()

  check(
    'the sitemap lists the legal pages',
    ['/imprint', '/privacy', '/terms', '/withdrawal'].every((path) =>
      sitemapXml.includes(path + '</loc>'),
    ),
  )
  check(
    'photo pages in the sitemap carry their image, videos none',
    sitemapXml.includes('<image:loc>') && !/<image:loc>[^<]*\.(mp4|webm|mov)</.test(sitemapXml),
  )
  check('artist pages without any content are left out', !sitemapXml.includes('/artist/x</loc>'))

  // Exhibition page: title, theme and description from the server; preview image with size
  const { GET: exhibitionPage } = await import('../../src/app/exhibition/[slug]/route')
  const exhibitionHtml = (slug: string) =>
    page(
      exhibitionPage(new Request('http://localhost:3000/exhibition/' + slug), {
        params: Promise.resolve({ slug }),
      }),
    )
  // "other-open" (area Security) stays public until the end
  const openHtml = await exhibitionHtml('other-open')

  check(
    'the exhibition title is in the HTML (no JavaScript needed)',
    openHtml.includes('<h1 id="title">Other open</h1>'),
  )
  check('the preview image comes with its size', openHtml.includes('og:image:width'))
  check('the first image is preloaded', openHtml.includes('rel="preload" as="image"'))
  check(
    'the main navigation is in the HTML',
    openHtml.includes('<nav id="menu"') && openHtml.includes('href="/exhibitions"'),
  )

  const lockedHtml = await exhibitionHtml('locked-one')

  check(
    'a locked exhibition puts no image of its content into the HTML',
    !lockedHtml.includes('/api/media/file/') &&
      !lockedHtml.includes('rel="preload"') &&
      !lockedHtml.includes(imageA.filename),
  )

  // Photo page: unnamed photos get a title of their own; prints as Product while the shop is open
  const { GET: photoPage } = await import('../../src/app/exhibition/[slug]/photo/[photo]/route')
  const photoHtml = (slug: string, photo: string) =>
    page(
      photoPage(new Request(`http://localhost:3000/exhibition/${slug}/photo/${photo}`), {
        params: Promise.resolve({ slug, photo }),
      }),
    )
  const otherOpen: AnyDoc = (
    await payload.find({
      collection: 'exhibitions',
      where: { slug: { equals: 'other-open' } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const unnamed = await photoHtml('other-open', String(otherOpen.gallery[0].file))

  check(
    'an unnamed photo gets "Photo 1 of 1" as title',
    unnamed.includes('<title>Photo 1 of 1 – Other open – '),
    unnamed.match(/<title>[^<]*/)?.[0],
  )

  const shop: AnyDoc = (
    await payload.find({
      collection: 'exhibitions',
      where: { slug: { equals: 'shop-one' } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const forSale = await photoHtml('shop-one', String(shop.gallery[0].file))

  check(
    'a photo for sale carries its prints as Product with price and availability',
    forSale.includes('"@type":"Product"') &&
      forSale.includes('"priceCurrency":"EUR"') &&
      forSale.includes('schema.org/'),
  )
  check(
    'the photo itself is an ImageObject with credit and copyright',
    forSale.includes('"@type":"ImageObject"') && forSale.includes('"copyrightNotice"'),
  )
}
