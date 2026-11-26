// Shared values of the HTML pages (src/templates/partials/head.html). Every page sets title,
// description, robots, canonical and ogImage; siteName, ogType and twitterCard have defaults
// (src/lib/render-template.ts).
import { jsonForScript } from './render-template'
import { serverUrl } from './site-identity'

// The preview image for links to pages without an image of their own
export function defaultOgImage(): string {
  return serverUrl() + '/og-default.jpg'
}

// The JSON-LD block for {{{jsonLd}}}; empty without data
export function jsonLdScript(data: unknown): string {
  return data ? `<script type="application/ld+json">${jsonForScript(data)}</script>` : ''
}
