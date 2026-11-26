// Shared SEO helpers for the route handlers (exhibition, events, sitemap)
import type { Payload, Where } from 'payload'

import type { Exhibition, Media } from '../payload-types'
import { SITE_NAME } from './site-identity'
import { SLUG_CONTEXT_KEY } from './visibility'

type MediaRef = number | string | Media | null | undefined

export function asMedia(ref: MediaRef): Media | null {
  return ref && typeof ref === 'object' ? ref : null
}

export function isImage(media: Media | null | undefined): media is Media {
  return Boolean(media && (media.mimeType || '').startsWith('image/'))
}

// Best public image URL of a medium: the requested size, then the other generated sizes.
// The original only as a last resort (GIFs, images without generated sizes): visitors cannot
// load original photos (EXIF/GPS, see src/collections/Media.ts). Videos are no images: null.
export function imageUrl(
  media: Media | null,
  size: 'large' | 'medium' | 'thumb' = 'large',
): string | null {
  if (!isImage(media)) {
    return null
  }

  const sizes = (media.sizes || {}) as Record<string, { url?: string | null } | undefined>

  return (
    sizes[size]?.url ||
    sizes.large?.url ||
    sizes.medium?.url ||
    sizes.thumb?.url ||
    media.url ||
    null
  )
}

// JSON-LD "Person" entries for the credited artists (only populated profiles)
export function artistsJsonLd(artists: unknown[] | null | undefined, base: string) {
  const people = (artists || [])
    .filter((artist): artist is { name: string; slug: string } =>
      Boolean(artist && typeof artist === 'object' && 'slug' in artist && 'name' in artist),
    )
    .map((artist) => ({
      '@type': 'Person',
      name: artist.name,
      url: `${base}/artist/${encodeURIComponent(artist.slug)}`,
    }))

  return people.length ? people : undefined
}

export function absolute(base: string, url: string | null): string | null {
  if (!url) {
    return null
  }

  return /^https?:\/\//.test(url) ? url : base + url
}

// Load exhibitions the way an anonymous visitor sees them.
// A lookup by slug passes it on as context: "locked with link" exhibitions only show their
// content when asked for directly (see requestedSlug in src/lib/visibility.ts).
export async function findPublicExhibitions(payload: Payload, where?: Where) {
  const slug = (where?.slug as { equals?: unknown } | undefined)?.equals

  const result = await payload.find({
    collection: 'exhibitions',
    where,
    context: typeof slug === 'string' ? { [SLUG_CONTEXT_KEY]: slug } : undefined,
    depth: 1,
    limit: 100,
    sort: 'date',
    overrideAccess: false,
  })

  return result.docs
}

// All of them, page by page (the public API returns at most 100 at a time), e.g. for the sitemap
export async function findAllPublicExhibitions(payload: Payload): Promise<Exhibition[]> {
  const all: Exhibition[] = []

  for (let page = 1; ; page += 1) {
    const result = await payload.find({
      collection: 'exhibitions',
      depth: 1,
      limit: 100,
      page,
      sort: 'date',
      overrideAccess: false,
    })

    all.push(...result.docs)

    if (!result.hasNextPage) {
      return all
    }
  }
}

// An exhibition with a fixed date that is still to come (Coming soon has none and gets no event JSON-LD)
export function hasUpcomingDate(exhibition: Exhibition): boolean {
  if (!exhibition.date || (exhibition.release && exhibition.release !== 'scheduled')) {
    return false
  }

  const today = new Date()

  today.setHours(0, 0, 0, 0)

  return new Date(exhibition.date) >= today
}

// "+01:00" in winter, "+02:00" in summer
export function centralEuropeanOffset(day: string, time: string): string {
  const moment = new Date(`${day}T${time}:00Z`)
  const name = Number.isNaN(moment.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vienna', timeZoneName: 'longOffset' })
        .formatToParts(moment)
        .find((part) => part.type === 'timeZoneName')?.value || ''
  const offset = name.replace('GMT', '')

  return /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : '+01:00'
}

// JSON-LD "Event" for an upcoming exhibition
export function eventJsonLd(exhibition: Exhibition, base: string) {
  const poster = asMedia(exhibition.posters?.[0])
  const image = absolute(base, imageUrl(poster))
  const day = exhibition.date?.slice(0, 10)
  const time = exhibition.time?.padStart(5, '0')
  // With a time, the offset of Central European time (Austria, Germany) on that day
  const startDate = day
    ? time
      ? `${day}T${time}${centralEuropeanOffset(day, time)}`
      : day
    : undefined

  return {
    '@type': 'ExhibitionEvent',
    name: exhibition.title,
    description: exhibition.description || undefined,
    startDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: exhibition.location
      ? { '@type': 'Place', name: exhibition.location, address: exhibition.location }
      : undefined,
    image: image ? [image] : undefined,
    url: `${base}/exhibition/${encodeURIComponent(exhibition.slug)}`,
    organizer: { '@type': 'Organization', name: SITE_NAME, url: base },
  }
}
