// GET /media-wm/<id>-<key>-<size>.webp: watermarked copy of a photo for sale (src/lib/watermark.ts).
// Only for public media (locked: false) that are for sale and only with the current key; made on
// the first request. The name changes with every new watermark, so the browser may keep it long.
// Like the media files: only browser caching (whether it may be delivered depends on "locked").
import fs from 'fs'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { ensureWatermarked, parseWatermarkFileName, watermarkSettings, watermarkSourceId } from '@/lib/watermark'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = parseWatermarkFileName((await params).file)

  if (!parsed) {
    return notFound()
  }

  const payload = await getPayload({ config: configPromise })
  const medium = await payload
    .findByID({ collection: 'media', id: parsed.id, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!medium || medium.locked !== false || !medium.forSale || medium.watermarkKey !== parsed.key) {
    return notFound()
  }

  // Which watermark: the same rule as the key in src/lib/media-lock.ts (watermarkSourceId)
  const site = await payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true })
  const { docs: exhibitions } = await payload.find({
    collection: 'exhibitions',
    where: { 'gallery.file': { equals: medium.id } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { gallery: true, watermark: true },
  })
  const sourceId = watermarkSourceId(medium.id, exhibitions, site.watermarkImage)
  const source: Media | null =
    sourceId === null
      ? null
      : await payload.findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true }).catch(() => null)

  let file: string

  try {
    file = await ensureWatermarked(medium, source, watermarkSettings(site), parsed.size)
  } catch (error) {
    payload.logger.error({ err: error, msg: `Watermark for medium ${medium.id} failed` })
    return notFound()
  }

  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  })
}
