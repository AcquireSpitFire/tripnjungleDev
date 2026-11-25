// Watermark on photos that are for sale (release 3.0).
//
// A medium is "for sale" when some exhibition offers a print of it with a fixed price or on
// request (src/lib/media-lock.ts sets "forSale" and "watermarkKey"). Visitors then only get
// watermarked copies of its web sizes, everywhere it is shown: src/collections/Media.ts rewrites
// the URLs to /media-wm/<id>-<key>-<size>.webp and refuses the plain files to visitors.
//
// The watermark: the image of the exhibition (lowest exhibition id wins if a photo is sold in
// several), otherwise the image of Site settings → Shop, otherwise the built-in lettering
// src/assets/watermark-default.svg. Opacity, size and position come from Site settings → Shop.
//
// The watermarked files are made on the first request and kept in MEDIA_DIR/watermarked/. The
// key changes with the watermark and the photo file, so a change gives new file names (old ones
// are deleted when the new ones are made).
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp, { type OverlayOptions } from 'sharp'

import type { Media, Site } from '../payload-types'

export const WATERMARK_SIZES = ['thumb', 'medium', 'large'] as const
export type WatermarkSize = (typeof WATERMARK_SIZES)[number]

export type WatermarkSettings = {
  opacity: number
  size: number
  position: 'center' | 'bottomRight' | 'tiled'
}

type FileInfo = Pick<Media, 'id' | 'filename' | 'filesize' | 'width' | 'height'>

const DEFAULT_SVG = path.join(process.cwd(), 'src', 'assets', 'watermark-default.svg')

function mediaDir(): string {
  return path.resolve(process.env.MEDIA_DIR || 'media')
}

function watermarkDir(): string {
  return path.join(mediaDir(), 'watermarked')
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function watermarkSettings(site: Pick<Site, 'watermarkOpacity' | 'watermarkSize' | 'watermarkPosition'>): WatermarkSettings {
  const position = site.watermarkPosition === 'bottomRight' || site.watermarkPosition === 'tiled' ? site.watermarkPosition : 'center'

  return {
    opacity: clamp(site.watermarkOpacity, 5, 60, 18),
    size: clamp(site.watermarkSize, 10, 90, 35),
    position,
  }
}

// Short hash of everything that changes the watermarked file
export function watermarkKey(medium: FileInfo, source: FileInfo | null, settings: WatermarkSettings): string {
  const parts = [
    medium.filename,
    medium.filesize,
    medium.width,
    medium.height,
    source ? `${source.id}:${source.filename}:${source.filesize}` : 'default',
    settings.opacity,
    settings.size,
    settings.position,
  ]

  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12)
}

export function watermarkFileName(id: number | string, key: string, size: WatermarkSize): string {
  return `${id}-${key}-${size}.webp`
}

// "/media-wm/<file>" → its parts (null if it is not a valid name)
export function parseWatermarkFileName(name: string): { id: number; key: string; size: WatermarkSize } | null {
  const match = /^(\d{1,10})-([a-f0-9]{12})-(thumb|medium|large)\.webp$/.exec(name)

  return match ? { id: Number(match[1]), key: match[2], size: match[3] as WatermarkSize } : null
}

// The file to start from: the requested web size, otherwise the nearest other size, otherwise the
// original (very small images have no sizes; sharp drops its EXIF data when writing).
function sourceFile(medium: Media, size: WatermarkSize): string | null {
  const sizes = (medium.sizes || {}) as Record<string, { filename?: string | null } | undefined>
  const order: WatermarkSize[] =
    size === 'thumb' ? ['thumb', 'medium', 'large'] : size === 'medium' ? ['medium', 'large', 'thumb'] : ['large', 'medium', 'thumb']
  const name = order.map((candidate) => sizes[candidate]?.filename).find(Boolean) || medium.filename

  if (!name) {
    return null
  }

  const file = path.join(mediaDir(), path.basename(name))

  return fs.existsSync(file) ? file : null
}

function watermarkImageFile(source: Media | null): string {
  if (source?.filename && (source.mimeType || '').startsWith('image/')) {
    const file = path.join(mediaDir(), path.basename(source.filename))

    if (fs.existsSync(file)) {
      return file
    }
  }

  return DEFAULT_SVG
}

// The watermark as a PNG of the given width with the opacity applied
async function watermarkOverlay(file: string, width: number, maxHeight: number, opacity: number): Promise<Buffer> {
  const resized = await sharp(file, { density: 300 })
    .resize({ width, height: maxHeight, fit: 'inside' })
    .ensureAlpha()
    .png()
    .toBuffer()

  // "dest-in" with a semi-transparent pixel multiplies the alpha channel by the opacity
  return sharp(resized)
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round((255 * opacity) / 100)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer()
}

async function render(medium: Media, source: Media | null, settings: WatermarkSettings, size: WatermarkSize, target: string) {
  const input = sourceFile(medium, size)

  if (!input) {
    throw new Error(`No file for medium ${medium.id}`)
  }

  // rotate(): apply the EXIF orientation of an original (the web sizes are upright already)
  const base = await sharp(input).rotate().toBuffer({ resolveWithObject: true })
  const { width, height } = base.info
  const overlayWidth = Math.max(16, Math.round((width * settings.size) / 100))
  const overlay = await watermarkOverlay(
    watermarkImageFile(source),
    overlayWidth,
    Math.max(16, Math.round(height * 0.9)),
    settings.opacity,
  )
  const { width: overlayW = overlayWidth, height: overlayH = 16 } = await sharp(overlay).metadata()

  let layer: OverlayOptions

  if (settings.position === 'tiled') {
    // Space between the tiles: half a watermark in each direction
    const tile = await sharp(overlay)
      .extend({
        top: Math.round(overlayH / 2),
        bottom: Math.round(overlayH / 2),
        left: Math.round(overlayW / 4),
        right: Math.round(overlayW / 4),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()

    layer = { input: tile, tile: true }
  } else if (settings.position === 'bottomRight') {
    const margin = Math.round(Math.min(width, height) * 0.04)

    layer = {
      input: overlay,
      left: Math.max(0, width - overlayW - margin),
      top: Math.max(0, height - overlayH - margin),
    }
  } else {
    layer = { input: overlay, gravity: 'center' }
  }

  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`

  await sharp(base.data).composite([layer]).webp({ quality: 80 }).toFile(temporary)
  fs.renameSync(temporary, target)
}

// Older watermarked files of this medium (other keys)
function removeOtherKeys(id: number | string, key: string): void {
  const dir = watermarkDir()

  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name.startsWith(`${id}-`) && !name.startsWith(`${id}-${key}-`)) {
      fs.rmSync(path.join(dir, name), { force: true })
    }
  }
}

export function removeWatermarkedFiles(id: number | string): void {
  removeOtherKeys(id, '')
}

const inFlight = new Map<string, Promise<string>>()

// Path of the watermarked file (made now if it does not exist yet)
export async function ensureWatermarked(
  medium: Media,
  source: Media | null,
  settings: WatermarkSettings,
  size: WatermarkSize,
): Promise<string> {
  const key = medium.watermarkKey || ''
  const target = path.join(watermarkDir(), watermarkFileName(medium.id, key, size))

  if (fs.existsSync(target)) {
    return target
  }

  const running = inFlight.get(target)

  if (running) {
    return running
  }

  const job = (async () => {
    fs.mkdirSync(watermarkDir(), { recursive: true })
    removeOtherKeys(medium.id, key)
    await render(medium, source, settings, size, target)

    return target
  })().finally(() => inFlight.delete(target))

  inFlight.set(target, job)

  return job
}
