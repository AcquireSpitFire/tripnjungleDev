// What can be bought: the prints of the photos in the exhibitions (gallery → prints).
// A cart item only names exhibition, photo, print and quantity. Name, price and details are
// always looked up here, the way a visitor sees the exhibition, so nothing locked or in planning
// can be bought and a manipulated price in the browser changes nothing.
import type { Payload } from 'payload'

import type { Artist, Exhibition, Media } from '../../payload-types'
import { absolute, findPublicExhibitions, imageUrl } from '../seo'
import { serverUrl } from '../site-identity'
import { isSlug } from '../slug'
import { contentIsOpen, toId } from '../visibility'

type PrintRow = NonNullable<
  NonNullable<NonNullable<Exhibition['gallery']>[number]['prints']>[number]
>

export type CartItemInput = {
  exhibition: string
  photo: string
  print: string
  quantity: number
}

export type Offer = {
  key: string
  exhibitionId: number
  exhibitionSlug: string
  exhibitionTitle: string
  mediaId: string
  photoName: string
  artistName: string
  printId: string
  label: string
  size: string
  material: string
  details: string
  pricing: 'fixed' | 'request'
  price: number | null
  // Copies for sale in total; null = no limit
  copies: number | null
  thumbUrl: string
  photoUrl: string
}

const MAX_CART_LINES = 20
const MAX_QUANTITY = 10

// Is this print shown to visitors? "No price" is not, and neither is a fixed price without an
// amount. Also decides whether the photo is "for sale" and gets the watermark (media-lock.ts).
export function isOffered(print: Pick<PrintRow, 'pricing' | 'price'> | null | undefined): boolean {
  if (print?.pricing === 'request') {
    return true
  }

  return print?.pricing === 'fixed' && typeof print.price === 'number' && print.price >= 1
}

// Photos only: no videos, no animated GIFs
export function isSellableMedia(media: Pick<Media, 'mimeType'> | null | undefined): boolean {
  const mimeType = media?.mimeType || ''

  return mimeType.startsWith('image/') && mimeType !== 'image/gif'
}

export function offerKey(exhibition: string, photo: string, print: string): string {
  return `${exhibition}/${photo}/${print}`
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

// Cart from the browser → clean list (duplicates merged); null if it is malformed
export function parseCartItems(value: unknown): CartItemInput[] | null {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES * 2) {
    return null
  }

  const merged = new Map<string, CartItemInput>()

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return null
    }

    const { exhibition, photo, print, quantity } = entry as Record<string, unknown>
    const photoId = typeof photo === 'number' ? String(photo) : photo

    if (
      !isSlug(exhibition) ||
      typeof photoId !== 'string' ||
      !ID_PATTERN.test(photoId) ||
      typeof print !== 'string' ||
      !ID_PATTERN.test(print)
    ) {
      return null
    }

    const slug = exhibition.toLowerCase()
    const amount = typeof quantity === 'number' && Number.isInteger(quantity) ? quantity : 1
    const key = offerKey(slug, photoId, print)

    merged.set(key, {
      exhibition: slug,
      photo: photoId,
      print,
      quantity: Math.min(MAX_QUANTITY, Math.max(1, (merged.get(key)?.quantity ?? 0) + amount)),
    })
  }

  return merged.size > MAX_CART_LINES ? null : [...merged.values()]
}

function formatSize(width: number | null | undefined, height: number | null | undefined): string {
  if (!width || !height) {
    return ''
  }

  const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

  return `${format(width)} × ${format(height)} cm`
}

function artistNames(exhibition: Exhibition, rowArtist: unknown): string {
  if (rowArtist && typeof rowArtist === 'object' && 'name' in rowArtist) {
    return (rowArtist as Artist).name || ''
  }

  return (exhibition.artists || [])
    .filter((artist): artist is Artist => Boolean(artist && typeof artist === 'object'))
    .map((artist) => artist.name)
    .filter(Boolean)
    .join(', ')
}

// All offers of an exhibition: only when visitors may see its content, or in the preview of a
// logged-in account (the exhibition was then loaded with the rights of that account)
export function offersOf(
  exhibition: Exhibition,
  base: string,
  options: { preview?: boolean } = {},
): Offer[] {
  if (!options.preview && !contentIsOpen(exhibition)) {
    return []
  }

  const offers: Offer[] = []

  for (const row of exhibition.gallery || []) {
    const media = row.file && typeof row.file === 'object' ? (row.file as Media) : null

    if (!media || !isSellableMedia(media)) {
      continue
    }

    const mediaId = String(toId(media))

    for (const print of row.prints || []) {
      if (!print.id || !isOffered(print)) {
        continue
      }

      const pricing = print.pricing === 'request' ? 'request' : 'fixed'

      offers.push({
        key: offerKey(exhibition.slug, mediaId, print.id),
        exhibitionId: exhibition.id,
        exhibitionSlug: exhibition.slug,
        exhibitionTitle: exhibition.title,
        mediaId,
        photoName:
          row.name?.trim() ||
          media.name?.trim() ||
          row.alt?.trim() ||
          media.alt?.trim() ||
          'Untitled',
        artistName: artistNames(exhibition, row.artist),
        printId: print.id,
        label: print.label,
        size: formatSize(print.width, print.height),
        material: print.material?.trim() || '',
        details: print.details?.trim() || '',
        pricing,
        price: pricing === 'fixed' ? (print.price as number) : null,
        copies:
          typeof print.copies === 'number' && print.copies >= 0 ? Math.floor(print.copies) : null,
        thumbUrl: absolute(base, imageUrl(media, 'thumb')) || '',
        photoUrl: `${base}/exhibition/${encodeURIComponent(exhibition.slug)}/photo/${encodeURIComponent(mediaId)}`,
      })
    }
  }

  return offers
}

// The offers of some exhibitions (by ID = slug), each exhibition loaded once
export async function findOffers(payload: Payload, slugs: string[]): Promise<Map<string, Offer>> {
  const base = serverUrl()
  const offers = new Map<string, Offer>()

  for (const slug of new Set(slugs)) {
    const [exhibition] = await findPublicExhibitions(payload, { slug: { equals: slug } })

    for (const offer of exhibition ? offersOf(exhibition, base) : []) {
      offers.set(offer.key, offer)
    }
  }

  return offers
}
