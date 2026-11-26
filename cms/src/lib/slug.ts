// IDs in addresses (/exhibition/<id>, /artist/<id>): lower-case letters, digits and hyphens,
// at most 100 characters. Checked before anything is looked up with them.
export const SLUG_RULE = 'Lowercase letters, numbers and hyphens only.'

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,100}$/.test(value)
}
