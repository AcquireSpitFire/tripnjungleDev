// /sitemap.xml: home page, lists, legal pages, all public exhibitions with their photo pages (with
// the photo as image entry – videos are no images), and the artist pages that have content.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { escapeHtml } from '@/lib/render-template'
import { absolute, asMedia, findAllPublicExhibitions, imageUrl } from '@/lib/seo'
import { serverUrl } from '@/lib/site-identity'
import { toId } from '@/lib/visibility'

export const dynamic = 'force-dynamic'

type Entry = { loc: string; lastmod?: string; priority: string; image?: string | null }

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()
  const exhibitions = await findAllPublicExhibitions(payload)

  const entries: Entry[] = [
    { loc: base + '/', priority: '1.0' },
    { loc: base + '/exhibitions', priority: '0.8' },
    { loc: base + '/events', priority: '0.8' },
    { loc: base + '/archive', priority: '0.5' },
    { loc: base + '/about', priority: '0.3' },
    { loc: base + '/imprint', priority: '0.1' },
    { loc: base + '/privacy', priority: '0.1' },
    { loc: base + '/terms', priority: '0.1' },
    { loc: base + '/withdrawal', priority: '0.1' },
  ]
  // Artists credited in an exhibition that visitors can see
  const credited = new Set<string>()

  for (const exhibition of exhibitions) {
    for (const artist of exhibition.artists || []) {
      const id = toId(artist)

      if (id !== null) {
        credited.add(String(id))
      }
    }

    if (exhibition.locked !== false) {
      continue
    }

    const page = base + '/exhibition/' + encodeURIComponent(exhibition.slug)
    const lastmod = exhibition.updatedAt?.slice(0, 10)

    entries.push({ loc: page, lastmod, priority: '0.7' })

    // Photo pages (targets of the QR codes)
    for (const row of exhibition.gallery || []) {
      const media = asMedia(row.file)
      const id = toId(row.file)

      if (id !== null) {
        entries.push({
          loc: `${page}/photo/${encodeURIComponent(String(id))}`,
          lastmod,
          priority: '0.5',
          image: absolute(base, imageUrl(media, 'large')),
        })
      }
    }
  }

  // Artist mini pages (artists with an external website only forward, so they are left out),
  // and only pages with something on them: a text, a portrait or a visible exhibition.
  // Server side and only these fields: all profiles, without the visitor page-size limit
  const { docs: artists } = await payload.find({
    collection: 'artists',
    where: { pageType: { equals: 'profile' } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { slug: true, updatedAt: true, shortText: true, portrait: true },
  })

  for (const artist of artists) {
    if (!artist.shortText?.trim() && !artist.portrait && !credited.has(String(artist.id))) {
      continue
    }

    entries.push({
      loc: base + '/artist/' + encodeURIComponent(artist.slug),
      lastmod: artist.updatedAt?.slice(0, 10),
      priority: '0.4',
    })
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    entries
      .map(
        (entry) =>
          `  <url><loc>${escapeHtml(entry.loc)}</loc>` +
          (entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '') +
          `<priority>${entry.priority}</priority>` +
          (entry.image
            ? `<image:image><image:loc>${escapeHtml(entry.image)}</image:loc></image:image>`
            : '') +
          '</url>',
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
