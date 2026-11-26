// Serve static pages (home, Exhibitions, Archive, About, Imprint, Privacy)
// from src/templates with absolute canonical/OG values
import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { htmlResponse, renderTemplate } from './render-template'
import { defaultOgImage, jsonLdScript } from './page'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from './site-identity'
import { getSiteSettings, type SiteSettings } from './site-settings'

type StaticPage = {
  template: string
  path: string
  title: string
  // If missing, the site description from the Site settings applies
  description?: string
  robots?: string
  // "summary" for text pages (small preview without the large image)
  twitterCard?: 'summary'
  jsonLd?: (base: string, description: string) => unknown
  // Additional placeholders, computed from the Site settings
  values?: (settings: SiteSettings, payload: Payload) => Record<string, string>
}

export async function renderStaticPage(page: StaticPage): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const settings = await getSiteSettings(payload)
  const base = serverUrl()
  const description = page.description || settings.siteDescription?.trim() || SITE_DESCRIPTION
  const data = page.jsonLd?.(base, description)

  return htmlResponse(
    renderTemplate(page.template, {
      title: page.title,
      description,
      canonical: base + page.path,
      ogImage: defaultOgImage(),
      robots: page.robots || 'index, follow',
      ...(page.twitterCard ? { twitterCard: page.twitterCard } : {}),
      jsonLd: jsonLdScript(data),
      ...(page.values?.(settings, payload) ?? {}),
    }),
    { cache: 'public, s-maxage=300, stale-while-revalidate=86400' },
  )
}
