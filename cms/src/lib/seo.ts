// Shared SEO helpers for the route handlers (exhibition, events, sitemap)
import type { Payload, Where } from 'payload'

import type { Exhibition, Media } from '../payload-types'

export const SITE_NAME = 'Tripnjungle'
export const SITE_DESCRIPTION =
  "Tripnjungle is Tom's web gallery: photo and video exhibitions from trips, nights out and everything in between."

export function getServerUrl(payload: Payload): string {
  return (payload.config.serverURL || 'http://localhost:3000').replace(/\/$/, '')
}

type MediaRef = number | string | Media | null | undefined

export function asMedia(ref: MediaRef): Media | null {
  return ref && typeof ref === 'object' ? ref : null
}

// Best public image URL of a medium (large → medium → original)
export function imageUrl(media: Media | null, size: 'large' | 'medium' | 'thumb' = 'large'): string | null {
  if (!media) {
    return null
  }

  const sizes = (media.sizes || {}) as Record<string, { url?: string | null } | undefined>

  return sizes[size]?.url || sizes.medium?.url || media.url || null
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

// Load exhibitions the way an anonymous visitor sees them
export async function findPublicExhibitions(payload: Payload, where?: Where) {
  const result = await payload.find({
    collection: 'exhibitions',
    where,
    depth: 1,
    limit: 100,
    sort: 'date',
    overrideAccess: false,
  })

  return result.docs
}

// Upcoming exhibition with a fixed date (Coming soon has none and gets no event JSON-LD)
export function isUpcoming(exhibition: Exhibition): boolean {
  if (!exhibition.date || (exhibition.release && exhibition.release !== 'scheduled')) {
    return false
  }

  const today = new Date()

  today.setHours(0, 0, 0, 0)

  return new Date(exhibition.date) >= today
}

// JSON-LD "Event" for an upcoming exhibition
export function eventJsonLd(exhibition: Exhibition, base: string) {
  const poster = asMedia(exhibition.posters?.[0])
  const image = absolute(base, imageUrl(poster))
  const startDate = exhibition.date
    ? exhibition.date.slice(0, 10) + (exhibition.time ? 'T' + exhibition.time.padStart(5, '0') : '')
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
