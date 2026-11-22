// Release and visibility of an exhibition (see src/collections/Exhibitions.ts).

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

export type Ref = number | string | { id: number | string } | null | undefined

export function toId(ref: Ref): number | string | null {
  if (ref === null || ref === undefined) {
    return null
  }

  return typeof ref === 'object' ? ref.id : ref
}
