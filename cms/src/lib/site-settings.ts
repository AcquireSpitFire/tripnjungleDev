// Load the site-wide settings (global "site") and prepare them for the templates
import type { Payload } from 'payload'

import type { Site } from '../payload-types'
import { escapeHtml } from './render-template'
import { splitParagraphs } from './text'

export type SiteSettings = Site

export async function getSiteSettings(payload: Payload): Promise<SiteSettings> {
  return payload.findGlobal({ slug: 'site', depth: 0 })
}

// Textarea → <p>…</p> per paragraph (blank line), line break inside → <br>
export function htmlParagraphs(text: string | null | undefined): string {
  return splitParagraphs(text)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

// Textarea → <ul><li>…</li></ul>, one line = one item
export function htmlList(text: string | null | undefined): string {
  const items = (text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!items.length) {
    return ''
  }

  return `<ul>${items.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
}

// Mark a missing required detail visibly so it is noticed before going live
export function htmlRequired(value: string | null | undefined, label: string): string {
  const clean = (value || '').trim()

  return clean
    ? escapeHtml(clean)
    : `<mark>[${escapeHtml(label)} – fill in under Admin → Site settings]</mark>`
}

export function htmlOptional(value: string | null | undefined): string {
  return escapeHtml((value || '').trim())
}

// "mailto:" link target with the address parts URL-encoded: characters like "?" or "&" in
// an address could otherwise add hidden recipients or a prefilled text (?bcc=…, &body=…)
export function mailtoHref(email: string): string {
  const at = email.lastIndexOf('@')

  if (at <= 0) {
    return 'mailto:' + encodeURIComponent(email)
  }

  return (
    'mailto:' +
    encodeURIComponent(email.slice(0, at)) +
    '@' +
    encodeURIComponent(email.slice(at + 1))
  )
}

export function htmlMailLink(value: string | null | undefined, label: string): string {
  const clean = (value || '').trim()

  return clean
    ? `<a href="${escapeHtml(mailtoHref(clean))}">${escapeHtml(clean)}</a>`
    : htmlRequired('', label)
}

export function htmlUrlLink(value: string | null | undefined): string {
  const clean = (value || '').trim()

  return /^https?:\/\//.test(clean)
    ? `<a href="${escapeHtml(clean)}" rel="noopener">${escapeHtml(clean)}</a>`
    : ''
}

export function formatLongDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date()

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
