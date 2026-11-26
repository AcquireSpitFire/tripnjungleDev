// /robots.txt: what search engines may fetch, and where the sitemap is.
//
// The pages load their data from /api/exhibitions and their images from /api/media/file/, so those
// two stay open – otherwise a search engine that renders the page would see it empty. The rest of
// the API, the admin, the shop endpoints and the order pages are closed. /cart is not closed: it
// carries "noindex" itself, which a search engine only sees when it may fetch the page.
import { serverUrl } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

function robotsText(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /api/exhibitions',
    'Allow: /api/media/file/',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /shop/',
    'Disallow: /order/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
}

export function GET() {
  return new Response(robotsText(serverUrl()), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400',
    },
  })
}
