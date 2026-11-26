// Serve static pages (home, Exhibitions, Archive, About, Imprint, Privacy)
// from src/templates with absolute canonical/OG values
import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { htmlResponse, jsonForScript, renderTemplate } from './render-template'
import { SITE_DESCRIPTION, SITE_NAME, serverUrl } from './site-identity'
import { getSiteSettings, type SiteSettings } from './site'

type StaticPage = {
  template: string
  path: string
  title: string
  // If missing, the site description from the Site settings applies
  description?: string
  robots?: string
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
      siteName: SITE_NAME,
      siteUrl: base,
      title: page.title,
      description,
      canonical: base + page.path,
      ogImage: base + '/og-default.jpg',
      robots: page.robots || 'index, follow',
      jsonLd: data ? `<script type="application/ld+json">${jsonForScript(data)}</script>` : '',
      ...(page.values?.(settings, payload) ?? {}),
    }),
    { cache: 'public, s-maxage=300, stale-while-revalidate=86400' },
  )
}
