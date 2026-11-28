// Fields that only the server writes (hooks and routes with overrideAccess): order snapshots,
// lock flags, proofs, keys. Values sent through the API or the admin form are ignored for them.
import type { Field, FieldAccess } from 'payload'

const never: FieldAccess = () => false

// access: serverOnly – readable like the document, never writable from outside
export const serverOnly = { create: never, update: never }

// access: hiddenServerOnly – not even readable through the API (e.g. anonymous keys)
export const hiddenServerOnly = { read: never, create: never, update: never }

// A text field shown read-only in the admin
export function readOnlyText(name: string, label: string, width?: string): Field {
  return {
    name,
    label,
    type: 'text',
    access: serverOnly,
    admin: { readOnly: true, ...(width ? { width } : {}) },
  }
}
