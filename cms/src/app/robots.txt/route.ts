// /robots.txt: do not crawl admin, API, cart and shop endpoints; announce the sitemap
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getServerUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const base = getServerUrl(payload)

  // The cart, the order pages and the shop endpoints are nothing to index
  const text = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /shop/',
    'Disallow: /order/',
    'Disallow: /cart',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400',
    },
  })
}
