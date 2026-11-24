// Fill the HTML templates from src/templates with meta data.
//   {{key}}   → HTML-escaped
//   {{{key}}} → raw (for JSON-LD)
import fs from 'fs'
import path from 'path'

// Relative to the working directory (cms/), because the bundled code lives
// somewhere else in the build than the source file
const templatesDir = path.join(process.cwd(), 'src', 'templates')
const cache = new Map<string, string>()

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// "</script>" inside the JSON-LD must not end the script tag
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function readTemplate(name: string): string {
  const cached = cache.get(name)

  if (cached && process.env.NODE_ENV === 'production') {
    return cached
  }

  const html = fs.readFileSync(path.join(templatesDir, name), 'utf8')

  cache.set(name, html)

  return html
}

// Version for /css/ and /js/: changes with every deploy (Railway sets the
// commit), otherwise with every server start. The browser caches the files (see
// next.config.ts) and fetches the new ones right after a deploy because of the new URL.
const assetVersion = (process.env.RAILWAY_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 12)

export function renderTemplate(name: string, values: Record<string, string>): string {
  // One single pass: inserted values are never scanned again, so "{{key}}" typed into a
  // CMS text stays literal text (a second pass would expand it – content corruption and,
  // repeated, a huge response that exhausts the server memory).
  // The asset version is added to the template itself, before any value is inserted.
  return readTemplate(name)
    .replace(/((?:href|src)="\/(?:css|js)\/[^"?#]+)"/g, `$1?v=${assetVersion}"`)
    .replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, rawKey: string | undefined, key: string | undefined) =>
      rawKey !== undefined ? (values[rawKey] ?? '') : escapeHtml(values[key ?? ''] ?? ''),
    )
}

// Shortens a description to meta length
export function summarize(text: string | null | undefined, max = 160): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()

  if (clean.length <= max) {
    return clean
  }

  return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

// Content security policy for the frontend pages (not for /admin, which has its own rules).
// Allowed: own scripts/styles/images, the YouTube player (API script + iframe), nothing else.
// Inline scripts are not allowed; the JSON-LD is a data block and is not executed.
function contentSecurityPolicy(): string {
  // Media URLs are absolute on PAYLOAD_PUBLIC_SERVER_URL; if the page is opened under a
  // different address (e.g. a preview domain), that origin has to be allowed
  const serverOrigin = (process.env.PAYLOAD_PUBLIC_SERVER_URL || '').replace(/\/$/, '')
  const self = ["'self'", serverOrigin].filter(Boolean).join(' ')

  return [
    "default-src 'self'",
    `script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com`,
    "style-src 'self'",
    `img-src ${self} data:`,
    `media-src ${self}`,
    `connect-src ${self}`,
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function htmlResponse(html: string, init?: { status?: number; cache?: string }): Response {
  return new Response(html, {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': init?.cache ?? 'public, s-maxage=60, stale-while-revalidate=600',
      'Content-Security-Policy': contentSecurityPolicy(),
    },
  })
}
