// Helpers for the plain text fields of the CMS (textareas): one place for line endings,
// paragraphs and the operator's address.
import type { Site } from '../payload-types'

// Line endings of a textarea (\r\n on Windows) → \n, trimmed
export function normalizeNewlines(text: string | null | undefined): string {
  return (text || '').replace(/\r\n/g, '\n').trim()
}

// A blank line starts a new paragraph
export function splitParagraphs(text: string | null | undefined): string[] {
  const clean = normalizeNewlines(text)

  return clean
    ? clean
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
    : []
}

// Name and postal address of the operator (Site settings → Legal notice), empty lines left out
export function operatorAddressLines(
  site: Pick<Site, 'operatorName' | 'operatorStreet' | 'operatorCity' | 'operatorCountry'>,
): string[] {
  return [site.operatorName, site.operatorStreet, site.operatorCity, site.operatorCountry]
    .map((line) => (line || '').trim())
    .filter(Boolean)
}
