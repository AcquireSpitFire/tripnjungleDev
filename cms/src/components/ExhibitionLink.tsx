'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Exhibition sidebar: public link to copy.
// Only appears once the exhibition is saved (before that the page does not exist).
export function ExhibitionLink() {
  const { id, initialData } = useDocumentInfo()
  const slugField = useFormFields(([fields]) => fields.slug)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // The saved slug counts; a change that is not saved yet would not be a valid link
  const savedSlug = typeof initialData?.slug === 'string' ? initialData.slug : ''
  const slug = savedSlug || (typeof slugField?.value === 'string' ? slugField.value : '')

  if (!id || !slug || !origin) {
    return null
  }

  const url = `${origin}/exhibition/${slug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link stays visible for selecting it by hand
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">Link to the exhibition</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Link to the exhibition"
        />
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={copy} style={{ margin: 0 }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className="field-description" style={{ marginTop: '0.5rem' }}>
        With “Locked”, visitors only see the details via this link, not the content.
      </p>
    </div>
  )
}
