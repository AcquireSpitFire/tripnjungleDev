// Shared values of the HTML pages (src/templates/partials/head.html). Every page sets title,
// description, robots, canonical and its preview image (ogImageValues); siteName, ogType and
// twitterCard have defaults (src/lib/render-template.ts).
import type { Media } from '../payload-types'
import { escapeHtml, jsonForScript } from './render-template'
import { absolute, isImage } from './seo'
import { SITE_NAME, serverUrl } from './site-identity'

// public/og-default.jpg
const DEFAULT_OG_IMAGE = { path: '/og-default.jpg', width: 1200, height: 630 }

export type OgImage = {
  url: string
  width?: number | null
  height?: number | null
  alt?: string | null
}

// {{ogImage}} and the size/alt tags of the preview image; without an image the default one
export function ogImageValues(image?: OgImage | null): { ogImage: string; ogImageMeta: string } {
  const chosen: OgImage = image?.url
    ? image
    : {
        url: serverUrl() + DEFAULT_OG_IMAGE.path,
        width: DEFAULT_OG_IMAGE.width,
        height: DEFAULT_OG_IMAGE.height,
        alt: SITE_NAME,
      }

  return {
    ogImage: chosen.url,
    ogImageMeta: [
      chosen.width ? `<meta property="og:image:width" content="${Number(chosen.width)}">` : '',
      chosen.height ? `<meta property="og:image:height" content="${Number(chosen.height)}">` : '',
      chosen.alt ? `<meta property="og:image:alt" content="${escapeHtml(chosen.alt)}">` : '',
    ]
      .filter(Boolean)
      .join('\n\t'),
  }
}

// The preview image of a photo: the "medium" size (1280 px) – large enough for every preview,
// quick for the crawlers. Videos have none.
export function mediaOgImage(media: Media | null | undefined, alt: string): OgImage | null {
  if (!isImage(media)) {
    return null
  }

  const sizes = (media.sizes || {}) as Record<
    string,
    { url?: string | null; width?: number | null; height?: number | null } | undefined
  >
  const size = sizes.medium?.url
    ? sizes.medium
    : sizes.large?.url
      ? sizes.large
      : sizes.thumb?.url
        ? sizes.thumb
        : null
  const url = absolute(serverUrl(), size?.url || media.url || null)

  return url
    ? {
        url,
        width: size ? size.width : media.width,
        height: size ? size.height : media.height,
        alt,
      }
    : null
}

// The JSON-LD block for {{{jsonLd}}}; empty without data
export function jsonLdScript(data: unknown): string {
  return data ? `<script type="application/ld+json">${jsonForScript(data)}</script>` : ''
}
