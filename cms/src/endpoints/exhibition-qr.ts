// GET /api/exhibitions/:id/qr?format=png|pdf[&media=<media id>]
//
//   format=png&media=…  QR code of one photo as PNG (preview + "Copy QR image" in the admin)
//   format=pdf&media=…  printable label of one photo
//   format=pdf          all photos of the exhibition in one PDF (one label per page)
//
// Only for logged-in accounts. The exhibition is loaded with the rights of the account
// (overrideAccess: false), so artists and editors only get codes for their own exhibitions;
// anything else answers 404 without telling whether the exhibition exists.
import type { Endpoint, PayloadRequest } from 'payload'

import { buildQrPdf, photoShortUrl, qrPng, type QrLabelFormat, type QrPdfSettings } from '../lib/qr'
import { serverUrl } from '../lib/site-identity'
import { toId } from '../lib/visibility'

const FORMATS: QrLabelFormat[] = ['a6', 'a5', 'square100']
const MAX_LABELS = 300

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// "Ana & Ben" from populated artist profiles
function artistNames(artists: unknown): string {
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => (artist && typeof artist === 'object' && 'name' in artist ? String(artist.name) : ''))
    .filter(Boolean)
    .join(' & ')
}

async function loadSettings(req: PayloadRequest): Promise<QrPdfSettings> {
  const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })
  const format = FORMATS.includes(site.qrFormat as QrLabelFormat) ? (site.qrFormat as QrLabelFormat) : 'a6'

  return {
    format,
    showTitle: site.qrShowTitle !== false,
    showArtist: site.qrShowArtist !== false,
    showExhibition: site.qrShowExhibition !== false,
    footer: site.qrFooter ?? 'Scan to view online',
  }
}

export const exhibitionQrEndpoint: Endpoint = {
  path: '/:id/qr',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      return error(401, 'Please log in.')
    }

    const id = String(req.routeParams?.id ?? '')
    const format = req.searchParams.get('format') || 'pdf'
    const media = req.searchParams.get('media')

    if (!/^\d+$/.test(id) || (media !== null && !/^\d+$/.test(media)) || !['png', 'pdf'].includes(format)) {
      return error(400, 'Invalid request.')
    }

    if (format === 'png' && !media) {
      return error(400, 'A PNG needs a photo (media=…).')
    }

    let exhibition

    try {
      exhibition = await req.payload.findByID({ collection: 'exhibitions', id, depth: 1, overrideAccess: false, req })
    } catch {
      return error(404, 'Exhibition not found.')
    }

    // One label per photo; a photo used twice gets one label. At most MAX_LABELS pages
    // (the gallery itself is limited to 300 rows), so one request cannot build a huge PDF.
    const seen = new Set<string>()
    const rows = (exhibition.gallery || []).filter((row) => {
      const id = toId(row.file)

      if (id === null || seen.has(String(id))) {
        return false
      }

      seen.add(String(id))
      return true
    })
    const selected = (media ? rows.filter((row) => String(toId(row.file)) === media) : rows).slice(0, MAX_LABELS)

    if (!selected.length) {
      return error(404, media ? 'This photo is not part of the saved exhibition.' : 'The exhibition has no photos yet.')
    }

    const base = serverUrl()

    if (format === 'png') {
      const png = await qrPng(photoShortUrl(base, media as string))

      return new Response(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="qr-${exhibition.slug}-${media}.png"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const settings = await loadSettings(req)
    const exhibitionArtists = artistNames(exhibition.artists)
    const labels = selected.map((row) => {
      const file = row.file && typeof row.file === 'object' ? row.file : null

      return {
        url: photoShortUrl(base, toId(row.file) as number),
        title: row.name || file?.name || '',
        artist: artistNames(row.artist ? [row.artist] : []) || exhibitionArtists,
        exhibition: exhibition.title,
      }
    })
    const bytes = await buildQrPdf(labels, settings, `QR codes – ${exhibition.title}`)
    const filename = media ? `qr-${exhibition.slug}-${media}.pdf` : `qr-${exhibition.slug}.pdf`

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  },
}
