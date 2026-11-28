// /exhibition/<id>: serves src/templates/exhibition.html with title, theme and description
// (rendered on the server, so they are there without JavaScript), meta data, the preview image
// and JSON-LD. Slideshow, gallery and video are rendered by public/js/exhibition.js in the
// browser (from sessionStorage or the API).
//
// Only what visitors may see goes into the HTML: findPublicExhibitions loads the exhibition as an
// anonymous visitor, so a locked one has no cover and no gallery here (and no image addresses).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { escapeHtml, htmlResponse, renderTemplate, summarize } from '@/lib/render-template'
import { jsonLdScript, mediaOgImage, ogImageValues } from '@/lib/page'
import {
  artistsJsonLd,
  asMedia,
  eventJsonLd,
  findPublicExhibitions,
  hasUpcomingDate,
  imageUrl,
  absolute,
  isImage,
} from '@/lib/seo'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from '@/lib/site-identity'
import { isSlug } from '@/lib/slug'
import type { Exhibition, Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

// The first image of the slideshow is the most important one of the page (LCP): the browser may
// fetch it before the scripts run. Same size choice as the slideshow (public/js/elements.js).
function preloadFirstImage(exhibition: Exhibition): string {
  const first = [
    asMedia(exhibition.frontPage),
    ...(exhibition.gallery || []).map((row) => asMedia(row.file)),
  ].find((media): media is Media => Boolean(media))

  if (!isImage(first)) {
    return ''
  }

  const sizes = (first.sizes || {}) as Record<
    string,
    { url?: string | null; width?: number | null } | undefined
  >
  const candidates = ['thumb', 'medium', 'large']
    .map((name) => sizes[name])
    .filter((size): size is { url: string; width: number } => Boolean(size?.url && size.width))
  const href = imageUrl(first, 'medium')

  if (!href) {
    return ''
  }

  const srcset = candidates.map((size) => `${size.url} ${size.width}w`).join(', ')

  return (
    `<link rel="preload" as="image" href="${escapeHtml(href)}" fetchpriority="high"` +
    (srcset
      ? ` imagesrcset="${escapeHtml(srcset)}" imagesizes="(max-width: 600px) 100vw, min(1200px, 90vw)"`
      : '') +
    '>'
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()

  const notFound = () =>
    htmlResponse(
      renderTemplate('exhibition.html', {
        ogType: 'article',
        title: 'Exhibition not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        canonical: base + '/exhibition/' + encodeURIComponent(slug),
        ...ogImageValues(),
        robots: 'noindex',
        heading: 'Exhibition not found',
        descriptionText: 'This exhibition does not exist (anymore).',
      }),
      { status: 404, cache: 'no-store' },
    )

  if (!isSlug(slug)) {
    return notFound()
  }

  const [exhibition] = await findPublicExhibitions(payload, { slug: { equals: slug } })

  if (!exhibition) {
    return notFound()
  }

  const locked = exhibition.locked !== false
  // "Locked with link": the page is served, but should not show up anywhere
  const linkOnly = exhibition.visibility === 'link'
  const canView = !locked || linkOnly
  const canonical = base + '/exhibition/' + encodeURIComponent(exhibition.slug)
  const description = summarize(
    exhibition.description || [exhibition.theme, SITE_DESCRIPTION].filter(Boolean).join(' – '),
  )
  // Link-only pages show no image to link previews (the address is shared on purpose)
  const ogImage = linkOnly
    ? null
    : mediaOgImage(asMedia(exhibition.posters?.[0]), 'Poster: ' + exhibition.title) ||
      mediaOgImage(asMedia(exhibition.frontPage), exhibition.title)

  const graph: Record<string, unknown>[] = []

  if (!locked) {
    const images = (exhibition.gallery || [])
      .map((row) => absolute(base, imageUrl(asMedia(row.file), 'large')))
      .filter(Boolean)

    graph.push({
      '@type': 'ImageGallery',
      name: exhibition.title,
      description: description || undefined,
      url: canonical,
      image: images,
      about: exhibition.theme || undefined,
      creator: artistsJsonLd(exhibition.artists, base),
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: base },
    })
  }

  // Link-only pages are noindex and carry no structured data of their own
  if (hasUpcomingDate(exhibition) && !linkOnly) {
    graph.push(eventJsonLd(exhibition, base))
  }

  return htmlResponse(
    renderTemplate('exhibition.html', {
      ogType: 'article',
      title: `${exhibition.title}${exhibition.theme ? ' – ' + exhibition.theme : ''} – ${SITE_NAME}`,
      description,
      canonical,
      ...ogImageValues(ogImage),
      robots: linkOnly ? 'noindex, nofollow' : locked ? 'noindex, follow' : 'index, follow',
      jsonLd: graph.length
        ? jsonLdScript({ '@context': 'https://schema.org', '@graph': graph })
        : '',
      headExtra: canView ? preloadFirstImage(exhibition) : '',
      heading: exhibition.title,
      theme: exhibition.theme || '',
      descriptionText: canView
        ? exhibition.description || ''
        : 'This exhibition is not available yet.',
    }),
  )
}
