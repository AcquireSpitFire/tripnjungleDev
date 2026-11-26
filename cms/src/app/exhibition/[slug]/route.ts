// /exhibition/<id>: serves src/templates/exhibition.html with title, description,
// preview image and JSON-LD of the exhibition. The content is still rendered by
// public/js/exhibition.js in the browser (from sessionStorage or the API).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, renderTemplate, summarize } from '@/lib/render-template'
import { defaultOgImage, jsonLdScript } from '@/lib/page'
import {
  absolute,
  artistsJsonLd,
  asMedia,
  eventJsonLd,
  findPublicExhibitions,
  imageUrl,
  hasUpcomingDate,
} from '@/lib/seo'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from '@/lib/site-identity'
import { isSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()

  // Values every answer of this page shares
  const common = { ogType: 'article' }
  const ogImageDefault = defaultOgImage()

  if (!isSlug(slug)) {
    return htmlResponse(
      renderTemplate('exhibition.html', {
        ...common,
        title: 'Exhibition not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        canonical: base + '/exhibition/' + encodeURIComponent(slug),
        ogImage: ogImageDefault,
        robots: 'noindex',
        jsonLd: '',
      }),
      { status: 404, cache: 'no-store' },
    )
  }

  const [exhibition] = await findPublicExhibitions(payload, { slug: { equals: slug } })

  if (!exhibition) {
    return htmlResponse(
      renderTemplate('exhibition.html', {
        ...common,
        title: 'Exhibition not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        canonical: base + '/exhibition/' + encodeURIComponent(slug),
        ogImage: ogImageDefault,
        robots: 'noindex',
        jsonLd: '',
      }),
      { status: 404, cache: 'no-store' },
    )
  }

  const locked = exhibition.locked !== false
  // "Locked with link": the page is served, but should not show up anywhere
  const linkOnly = exhibition.visibility === 'link'
  const canonical = base + '/exhibition/' + encodeURIComponent(exhibition.slug)
  const poster = asMedia(exhibition.posters?.[0])
  const frontPage = asMedia(exhibition.frontPage)
  const ogImage =
    (!linkOnly && absolute(base, imageUrl(poster) || imageUrl(frontPage))) || ogImageDefault
  const description = summarize(
    exhibition.description ||
      [exhibition.theme, SITE_DESCRIPTION].filter(Boolean).join(' – '),
  )

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

  const jsonLd = graph.length
    ? jsonLdScript({ '@context': 'https://schema.org', '@graph': graph })
    : ''

  return htmlResponse(
    renderTemplate('exhibition.html', {
      ...common,
      title: `${exhibition.title}${exhibition.theme ? ' – ' + exhibition.theme : ''} – ${SITE_NAME}`,
      description,
      canonical,
      ogImage,
      robots: linkOnly ? 'noindex, nofollow' : locked ? 'noindex, follow' : 'index, follow',
      jsonLd,
    }),
  )
}
