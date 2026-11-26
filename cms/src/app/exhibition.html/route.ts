import { isSlug } from '@/lib/slug'

// Permanently redirect old links /exhibition.html?id=<id> to /exhibition/<id>
// (as a route handler so the query parameter is not carried over)
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || ''
  const target = isSlug(id) ? '/exhibition/' + encodeURIComponent(id) : '/exhibitions'

  // Relative target: never built from the Host header of the request (a cache that ignores
  // X-Forwarded-Host could otherwise keep a redirect to a foreign host)
  return new Response(null, {
    status: 301,
    headers: { Location: target, 'Cache-Control': 'public, max-age=3600' },
  })
}
