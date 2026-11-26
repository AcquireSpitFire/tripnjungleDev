// Release and visibility of an exhibition (see src/collections/Exhibitions.ts).
import { isSlug } from './slug'

export type Visibility = 'locked' | 'link' | 'public'
export type Release = 'scheduled' | 'comingSoon' | 'planning'

export type VisibilitySettings = {
  locked?: boolean | null
  visibility?: Visibility | null
  release?: Release | null
}

export function getVisibility(doc: VisibilitySettings | null | undefined): Visibility {
  return doc?.visibility || (doc?.locked === false ? 'public' : 'locked')
}

export function getRelease(doc: VisibilitySettings | null | undefined): Release {
  return doc?.release || 'scheduled'
}

// Content (cover, gallery) available to visitors? Public or "locked with link", not in planning
export function contentIsOpen(doc: VisibilitySettings | null | undefined): boolean {
  return getRelease(doc) !== 'planning' && getVisibility(doc) !== 'locked'
}

// The exhibition a request asks for by its ID (slug), if any:
//   - REST: /api/exhibitions?where[slug][equals]=<slug> (public/js/data.js, loadExhibition)
//   - Local API of the server pages: context { tjSlug: <slug> }
// "Locked with link" exhibitions only show their content to such requests, never in lists
// (otherwise /api/exhibitions would hand out every "secret" gallery).
type SlugRequest = {
  context?: Record<string, unknown>
  query?: Record<string, unknown>
  searchParams?: URLSearchParams
}

// Context key with which findPublicExhibitions (src/lib/seo.ts) passes the slug it looks up
export const SLUG_CONTEXT_KEY = 'tjSlug'

export function requestedSlug(req: SlugRequest | null | undefined): string | null {
  const fromContext = req?.context?.[SLUG_CONTEXT_KEY]
  const where = req?.query?.where as { slug?: { equals?: unknown } } | undefined
  const candidate =
    (typeof fromContext === 'string' && fromContext) ||
    (typeof where?.slug?.equals === 'string' && where.slug.equals) ||
    req?.searchParams?.get('where[slug][equals]') ||
    null

  const slug = candidate ? candidate.toLowerCase() : null

  return isSlug(slug) ? slug : null
}

export type Ref = number | string | { id: number | string } | null | undefined

export function toId(ref: Ref): number | string | null {
  if (ref === null || ref === undefined || ref === '') {
    return null
  }

  return typeof ref === 'object' ? ref.id : ref
}
