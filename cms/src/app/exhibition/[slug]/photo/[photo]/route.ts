// /exhibition/<exhibition id>/photo/<media id>: page of a single photo – the target of
// the QR codes (via /p/<media id>). Serves src/templates/photo.html with title,
// description, preview image and JSON-LD; public/js/photo.js renders the photo.
// Visibility as for the exhibition: public and "locked with link" show the photo,
// locked exhibitions show "not available yet" (the photo is not even sent).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, renderTemplate, summarize } from '@/lib/render-template'
import { defaultOgImage, jsonLdScript } from '@/lib/page'
import { absolute, artistsJsonLd, asMedia, findPublicExhibitions, imageUrl } from '@/lib/seo'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from '@/lib/site-identity'
import { isSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; photo: string }> }) {
  const { slug, photo } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()
  const path = `/exhibition/${encodeURIComponent(slug)}/photo/${encodeURIComponent(photo)}`

  const common = {
    canonical: base + path,
    ogType: 'article',
  }

  const missing = () =>
    htmlResponse(
      renderTemplate('photo.html', {
        ...common,
        title: 'Photo not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        ogImage: defaultOgImage(),
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
  // Visitors only get the gallery when the content is open (public or with link)
  const row = (exhibition.gallery || []).find((entry) => String(asMedia(entry.file)?.id ?? entry.file) === photo)

  if ((!locked || linkOnly) && !row) {
    return missing()
  }

  const media = asMedia(row?.file)
  const name = row?.name || media?.name || ''
  const artists = row?.artist ? [row.artist] : exhibition.artists
  const image = !locked && media ? absolute(base, imageUrl(media, 'large')) : null
  const description = summarize(
    [name, row?.alt || media?.alt, exhibition.title + (exhibition.theme ? ' – ' + exhibition.theme : '')]
      .filter(Boolean)
      .join(' · ') || SITE_DESCRIPTION,
  )

  const jsonLd =
    !locked && media
      ? jsonLdScript({
          '@context': 'https://schema.org',
          '@type': 'Photograph',
          name: name || exhibition.title,
          description: row?.alt || media.alt || undefined,
          image: image || undefined,
          url: base + path,
          creator: artistsJsonLd(artists, base),
          isPartOf: { '@type': 'ImageGallery', name: exhibition.title, url: base + exhibitionUrl },
        })
      : ''

  return htmlResponse(
    renderTemplate('photo.html', {
      ...common,
      title: `${name ? name + ' – ' : ''}${exhibition.title} – ${SITE_NAME}`,
      description,
      ogImage: image || defaultOgImage(),
      robots: linkOnly ? 'noindex, nofollow' : locked ? 'noindex, follow' : 'index, follow',
      jsonLd,
      photoState: 'ok',
      heading: name || exhibition.title,
      backUrl: exhibitionUrl,
      backLabel: exhibition.title,
      exhibitionUrl: exhibitionUrl + (media ? '#media-' + media.id : ''),
      exhibitionLabel: 'View full exhibition',
    }),
  )
}
