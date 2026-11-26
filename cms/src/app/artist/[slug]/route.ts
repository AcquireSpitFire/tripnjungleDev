// /artist/<slug>: the small page of an artist (Admin → Artists).
//   "Link to the artist's own website" → 302 to that address
//   "Mini page on Tripnjungle"        → portrait, short text, links, contact and
//                                        the public exhibitions of the artist
// Rendered completely on the server (no JS, no API call from the browser).
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { escapeHtml, htmlResponse, renderTemplate, summarize } from '@/lib/render-template'
import { defaultOgImage, jsonLdScript } from '@/lib/page'
import { absolute, asMedia, findPublicExhibitions, imageUrl } from '@/lib/seo'
import { SITE_NAME, serverUrl } from '@/lib/site-identity'
import { getSiteSettings, htmlMailLink, htmlParagraphs, mailtoHref } from '@/lib/site-settings'
import { isSlug } from '@/lib/slug'
import type { Artist, Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

function httpsUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL((value || '').trim())

    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function portraitHtml(portrait: Media | null, name: string): string {
  const src = imageUrl(portrait, 'medium')

  if (!portrait || !src) {
    return ''
  }

  type Size = { url?: string | null; width?: number | null; height?: number | null }

  const sizes = (portrait.sizes || {}) as Record<string, Size | undefined>
  const srcset = ['thumb', 'medium', 'large']
    .map((size) => sizes[size])
    .filter((entry): entry is Size => Boolean(entry?.url && entry.width))
    .map((entry) => `${escapeHtml(entry.url)} ${entry.width}w`)
    .join(', ')
  // Dimensions of the generated size: rotated correctly (the original may rely on EXIF)
  const width = sizes.medium?.width || portrait.width
  const height = sizes.medium?.height || portrait.height

  return (
    `<img class="artist_portrait" src="${escapeHtml(src)}"` +
    (srcset ? ` srcset="${srcset}" sizes="(max-width: 600px) 100vw, 320px"` : '') +
    (width && height ? ` width="${width}" height="${height}"` : '') +
    ` alt="${escapeHtml(portrait.alt || 'Portrait of ' + name)}" decoding="async">`
  )
}

function linksHtml(artist: Artist): string {
  const links = [
    ['Website', httpsUrl(artist.website)],
    ['Instagram', httpsUrl(artist.instagram)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  if (!links.length) {
    return ''
  }

  return `<ul class="artist_links">${links
    .map(
      ([label, url]) =>
        `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${label} ↗</a></li>`,
    )
    .join('')}</ul>`
}

function contactHtml(artist: Artist, siteContact: string | null | undefined): string {
  if (artist.contactVia === 'artist') {
    // Without the consent the API does not even return the details (field access)
    if (!artist.contactConsent) {
      return ''
    }

    const parts: string[] = []
    const email = (artist.contactEmail || '').trim()
    const phone = (artist.contactPhone || '').trim()

    if (email) {
      parts.push(`<a href="${escapeHtml(mailtoHref(email))}">${escapeHtml(email)}</a>`)
    }

    if (phone) {
      parts.push(
        `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a>`,
      )
    }

    return parts.length ? `<h2>Contact</h2><p>${parts.join('<br>')}</p>` : ''
  }

  return `<h2>Contact</h2><p>Inquiries via ${SITE_NAME}: ${htmlMailLink(siteContact, 'Contact e-mail')}</p>`
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()

  const common = {
    ogImage: defaultOgImage(),
    ogType: 'profile',
    jsonLd: '',
  }

  const notFound = () =>
    htmlResponse(
      renderTemplate('artist.html', {
        ...common,
        title: 'Artist not found – ' + SITE_NAME,
        heading: 'Artist not found',
        description: 'This artist page does not exist.',
        canonical: base + '/artist/' + encodeURIComponent(slug),
        robots: 'noindex',
        artistBody: '<p>This artist page does not exist. <a href="/">Back to the home page</a></p>',
      }),
      { status: 404, cache: 'no-store' },
    )

  if (!isSlug(slug)) {
    return notFound()
  }

  // As a visitor: no login, contact details only with consent
  const {
    docs: [artist],
  } = await payload.find({
    collection: 'artists',
    where: { slug: { equals: slug } },
    depth: 1,
    limit: 1,
    overrideAccess: false,
  })

  if (!artist) {
    return notFound()
  }

  if (artist.pageType === 'external') {
    const target = httpsUrl(artist.externalUrl)

    // The target comes from the admin: managers, and the artist account of this profile.
    // So an artist account can point its own page anywhere (https only, CR/LF impossible).
    // Accepted on purpose: every artist account is known personally and the pages are
    // checked (README, "Security notes").
    return target
      ? new Response(null, {
          status: 302,
          headers: { Location: target, 'Cache-Control': 'public, s-maxage=60' },
        })
      : notFound()
  }

  const settings = await getSiteSettings(payload)
  const portrait = asMedia(artist.portrait)
  const exhibitions = (
    await findPublicExhibitions(payload, { artists: { in: [artist.id] } })
  ).filter((exhibition) => exhibition.locked === false)
  const canonical = base + '/artist/' + encodeURIComponent(artist.slug)
  const description =
    summarize(artist.shortText) ||
    `${artist.name} – artist on ${SITE_NAME}: photo and video exhibitions.`

  const exhibitionsHtml = exhibitions.length
    ? `<h2>Exhibitions</h2><ul class="artist_exhibitions">${exhibitions
        .map(
          (exhibition) =>
            `<li><a href="/exhibition/${encodeURIComponent(exhibition.slug)}">${escapeHtml(exhibition.title)}</a>` +
            (exhibition.theme
              ? ` <span class="artist_exhibition_theme">${escapeHtml(exhibition.theme)}</span>`
              : '') +
            '</li>',
        )
        .join('')}</ul>`
    : ''

  const sameAs = [httpsUrl(artist.website), httpsUrl(artist.instagram)].filter(Boolean)
  const image = absolute(base, imageUrl(portrait, 'large'))
  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: artist.name,
    url: canonical,
    description: summarize(artist.shortText) || undefined,
    image: image || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  })

  return htmlResponse(
    renderTemplate('artist.html', {
      ...common,
      title: `${artist.name} – ${SITE_NAME}`,
      heading: artist.name,
      description,
      canonical,
      ogImage: image || common.ogImage,
      robots: 'index, follow',
      jsonLd,
      artistBody:
        [
          portraitHtml(portrait, artist.name),
          htmlParagraphs(artist.shortText),
          linksHtml(artist),
          contactHtml(artist, settings.contactEmail),
          exhibitionsHtml,
        ]
          .filter(Boolean)
          .join('\n') || '<p>More about this artist soon.</p>',
    }),
    // Short: withdrawn contact details must disappear quickly from caches
    { cache: 'public, s-maxage=60, stale-while-revalidate=300' },
  )
}
