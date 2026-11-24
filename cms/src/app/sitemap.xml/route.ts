// /sitemap.xml: home page, lists, all public exhibitions and the artist pages
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { escapeHtml } from '@/lib/render-template'
import { findPublicExhibitions, getServerUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const base = getServerUrl(payload)
  const exhibitions = await findPublicExhibitions(payload)

  const entries: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: base + '/', priority: '1.0' },
    { loc: base + '/exhibitions', priority: '0.8' },
    { loc: base + '/events', priority: '0.8' },
    { loc: base + '/archive', priority: '0.5' },
    { loc: base + '/about', priority: '0.3' },
  ]

  for (const exhibition of exhibitions) {
    if (exhibition.locked === false) {
      const page = base + '/exhibition/' + encodeURIComponent(exhibition.slug)
      const lastmod = exhibition.updatedAt?.slice(0, 10)

      entries.push({ loc: page, lastmod, priority: '0.7' })

      // Photo pages (targets of the QR codes)
      for (const row of exhibition.gallery || []) {
        const id = row.file && typeof row.file === 'object' ? row.file.id : row.file

        if (id) {
          entries.push({ loc: `${page}/photo/${encodeURIComponent(String(id))}`, lastmod, priority: '0.5' })
        }
      }
    }
  }

  // Artist mini pages (artists with an external website only forward, so they are left out)
  // Server side and only slug/date: all profiles, without the visitor page-size limit
  const { docs: artists } = await payload.find({
    collection: 'artists',
    where: { pageType: { equals: 'profile' } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { slug: true, updatedAt: true },
  })

  for (const artist of artists) {
    entries.push({
      loc: base + '/artist/' + encodeURIComponent(artist.slug),
      lastmod: artist.updatedAt?.slice(0, 10),
      priority: '0.4',
    })
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (entry) =>
          `  <url><loc>${escapeHtml(entry.loc)}</loc>` +
          (entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '') +
          `<priority>${entry.priority}</priority></url>`,
      )
      .join('\n') +
    '\n</urlset>\n'

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
