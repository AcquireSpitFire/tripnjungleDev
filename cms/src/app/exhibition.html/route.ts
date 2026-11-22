// Permanently redirect old links /exhibition.html?id=<id> to /exhibition/<id>
// (as a route handler so the query parameter is not carried over)
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || ''
  const target = /^[a-z0-9-]+$/i.test(id) ? '/exhibition/' + encodeURIComponent(id) : '/exhibitions'

  return Response.redirect(new URL(target, request.url), 301)
}
