// /events: serves src/templates/events.html with JSON-LD of all upcoming exhibitions.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, jsonForScript, renderTemplate } from '@/lib/render-template'
import { eventJsonLd, findPublicExhibitions, hasUpcomingDate } from '@/lib/seo'
import { SITE_NAME, serverUrl } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const base = serverUrl()
  const upcoming = (await findPublicExhibitions(payload)).filter(hasUpcomingDate)

  const jsonLd = upcoming.length
    ? `<script type="application/ld+json">${jsonForScript({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Upcoming exhibitions – ' + SITE_NAME,
        itemListElement: upcoming.map((exhibition, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: { '@context': 'https://schema.org', ...eventJsonLd(exhibition, base) },
        })),
      })}</script>`
    : ''

  return htmlResponse(
    renderTemplate('events.html', {
      siteName: SITE_NAME,
      siteUrl: base,
      canonical: base + '/events',
      ogImage: base + '/og-default.jpg',
      jsonLd,
    }),
  )
}
