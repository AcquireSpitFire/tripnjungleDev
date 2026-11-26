// /exhibition/<exhibition id>/photo/<media id>: page of a single photo – the target of the QR
// codes (via /p/<media id>). Serves src/templates/photo.html with title, description, preview
// image and JSON-LD (the photo as ImageObject, its prints as Product while the shop is open);
// public/js/photo.js renders the photo.
// Visibility as for the exhibition: public and "locked with link" show the photo,
// locked exhibitions show "not available yet" (the photo is not even sent).
import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { htmlResponse, renderTemplate, summarize } from '@/lib/render-template'
import { jsonLdScript, mediaOgImage, ogImageValues } from '@/lib/page'
import {
  absolute,
  artistsJsonLd,
  asMedia,
  findPublicExhibitions,
  imageUrl,
  isImage,
} from '@/lib/seo'
import { offersOf } from '@/lib/shop/catalog'
import { getShopSettings } from '@/lib/shop/settings'
import { copiesLeft, countTaken } from '@/lib/shop/stock'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from '@/lib/site-identity'
import { isSlug } from '@/lib/slug'
import type { Exhibition } from '@/payload-types'

export const dynamic = 'force-dynamic'

// The prints of this photo with a fixed price, as schema.org products (only while the shop is open)
async function printsJsonLd(
  payload: Payload,
  exhibition: Exhibition,
  mediaId: string,
  pageUrl: string,
  image: string | null,
) {
  const settings = await getShopSettings(payload)

  if (!settings.enabled) {
    return []
  }

  const offers = offersOf(exhibition, serverUrl()).filter(
    (offer) => offer.mediaId === mediaId && offer.pricing === 'fixed' && offer.price !== null,
  )
  const taken = await countTaken(
    payload,
    offers.map((offer) => offer.printId),
  )

  return offers.map((offer) => ({
    '@type': 'Product',
    name: `${offer.photoName} – ${offer.label}`,
    description:
      [offer.size, offer.material, offer.details].filter(Boolean).join(' · ') || undefined,
    image: image || undefined,
    offers: {
      '@type': 'Offer',
      price: (offer.price ?? 0).toFixed(2),
      priceCurrency: 'EUR',
      availability:
        copiesLeft(offer, taken) === 0
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
      url: pageUrl,
    },
  }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; photo: string }> },
) {
  const { slug, photo } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()

  const missing = () =>
    htmlResponse(
      renderTemplate('photo.html', {
        ogType: 'article',
        canonical: `${base}/exhibition/${encodeURIComponent(slug)}/photo/${encodeURIComponent(photo)}`,
        title: 'Photo not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        ...ogImageValues(),
        robots: 'noindex',
        jsonLd: '',
        photoState: 'missing',
        heading: 'Photo not found',
        backUrl: '/',
        backLabel: SITE_NAME,
        exhibitionUrl: '/exhibitions',
        exhibitionLabel: 'All exhibitions',
      }),
      { status: 404, cache: 'no-store' },
    )

  if (!isSlug(slug) || !/^\d{1,12}$/.test(photo)) {
    return missing()
  }

  const [exhibition] = await findPublicExhibitions(payload, { slug: { equals: slug } })

  if (!exhibition) {
    return missing()
  }

  const locked = exhibition.locked !== false
  const linkOnly = exhibition.visibility === 'link'
  const exhibitionUrl = `/exhibition/${encodeURIComponent(exhibition.slug)}`
  const pageUrl = `${base}${exhibitionUrl}/photo/${encodeURIComponent(photo)}`
  // Visitors only get the gallery when the content is open (public or with link)
  const gallery = exhibition.gallery || []
  const index = gallery.findIndex(
    (entry) => String(asMedia(entry.file)?.id ?? entry.file) === photo,
  )
  const row = index >= 0 ? gallery[index] : undefined

  if ((!locked || linkOnly) && !row) {
    return missing()
  }

  const media = asMedia(row?.file)
  const name = row?.name || media?.name || ''
  // Photos without a name still get a title of their own (no duplicate titles)
  const label = name || (row ? `Photo ${index + 1} of ${gallery.length}` : '')
  const artists = row?.artist ? [row.artist] : exhibition.artists
  const artistNames = (artists || [])
    .map((artist) => (artist && typeof artist === 'object' ? artist.name : ''))
    .filter(Boolean)
    .join(' & ')
  const isPhoto = !locked && isImage(media)
  const image = isPhoto ? absolute(base, imageUrl(media, 'large')) : null
  const description = summarize(
    [
      name,
      row?.alt || media?.alt,
      exhibition.title + (exhibition.theme ? ' – ' + exhibition.theme : ''),
    ]
      .filter(Boolean)
      .join(' · ') || SITE_DESCRIPTION,
  )

  const graph: Record<string, unknown>[] = []

  // Videos get no image data (they are no images); locked photos are not even sent
  if (isPhoto && media && image) {
    const credit = artistNames || SITE_NAME

    graph.push({
      '@type': 'ImageObject',
      name: label,
      description: row?.alt || media.alt || undefined,
      contentUrl: image,
      url: pageUrl,
      width: media.sizes?.large?.width || undefined,
      height: media.sizes?.large?.height || undefined,
      creator: artistsJsonLd(artists, base),
      creditText: credit,
      copyrightNotice: `© ${credit}`,
      isPartOf: { '@type': 'ImageGallery', name: exhibition.title, url: base + exhibitionUrl },
    })
    graph.push(...(await printsJsonLd(payload, exhibition, String(media.id), pageUrl, image)))
  }

  return htmlResponse(
    renderTemplate('photo.html', {
      ogType: 'article',
      canonical: pageUrl,
      title: `${label ? label + ' – ' : ''}${exhibition.title} – ${SITE_NAME}`,
      description,
      ...ogImageValues(isPhoto ? mediaOgImage(media, row?.alt || media?.alt || label) : null),
      robots: linkOnly ? 'noindex, nofollow' : locked ? 'noindex, follow' : 'index, follow',
      jsonLd: graph.length
        ? jsonLdScript({ '@context': 'https://schema.org', '@graph': graph })
        : '',
      photoState: 'ok',
      heading: name || exhibition.title,
      backUrl: exhibitionUrl,
      backLabel: exhibition.title,
      exhibitionUrl: exhibitionUrl + (media ? '#media-' + media.id : ''),
      exhibitionLabel: 'View full exhibition',
    }),
  )
}
