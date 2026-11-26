// /p/<media id>: the short link printed in the QR codes. Forwards to the photo page
// /exhibition/<exhibition id>/photo/<media id> of the exhibition that shows the photo.
//
// 302, not 301: the target may change later (e.g. /adventure/… in a later release) and
// browsers must not remember the old one forever. Printed codes never change.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, renderTemplate } from '@/lib/render-template'
import { ogImageValues } from '@/lib/page'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()

  const missing = () =>
    htmlResponse(
      renderTemplate('photo.html', {
        title: 'Photo not found – ' + SITE_NAME,
        description: SITE_DESCRIPTION,
        canonical: base + '/p/' + encodeURIComponent(id),
        ...ogImageValues(),
        robots: 'noindex',
        ogType: 'article',
        jsonLd: '',
        photoState: 'missing',
        heading: 'Photo not found',
        backUrl: '/',
        backLabel: SITE_NAME,
        exhibitionUrl: '/exhibitions',
        exhibitionLabel: 'All exhibitions',
      }),
      { status: 404, cache: 'no-store' },
    )

  if (!/^\d{1,12}$/.test(id)) {
    return missing()
  }

  // overrideAccess: visitors cannot read the gallery of locked exhibitions, but the short
  // link still has to find the exhibition (its photo page then says "not available yet").
  // Only the ID of the exhibition is used, and "planning" stays invisible.
  const { docs } = await payload.find({
    collection: 'exhibitions',
    where: {
      and: [
        { 'gallery.file': { equals: Number(id) } },
        { or: [{ release: { not_equals: 'planning' } }, { release: { exists: false } }] },
      ],
    },
    depth: 0,
    limit: 10,
    overrideAccess: true,
    select: { slug: true, visibility: true, locked: true, release: true },
  })

  if (!docs.length) {
    return missing()
  }

  // Prefer the exhibition that actually shows the photo: public, then "with link"
  const rank = (visibility?: string | null) =>
    visibility === 'public' ? 0 : visibility === 'link' ? 1 : 2
  const [target] = [...docs].sort((a, b) => rank(a.visibility) - rank(b.visibility))

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/exhibition/${encodeURIComponent(target.slug)}/photo/${id}`,
      'Cache-Control': 'public, s-maxage=60',
    },
  })
}
