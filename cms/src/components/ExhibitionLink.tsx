'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Seitenleiste der Ausstellung: öffentlicher Link zum Kopieren.
// Erscheint erst, wenn die Ausstellung gespeichert ist (vorher gibt es die Seite nicht).
export function ExhibitionLink() {
  const { id, initialData } = useDocumentInfo()
  const slugField = useFormFields(([fields]) => fields.slug)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // Der gespeicherte Slug zählt; eine noch nicht gespeicherte Änderung wäre noch kein gültiger Link
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
      // Zwischenablage blockiert: Link bleibt zum manuellen Markieren sichtbar
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">Link zur Ausstellung</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Link zur Ausstellung"
        />
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={copy} style={{ margin: 0 }}>
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
      <p className="field-description" style={{ marginTop: '0.5rem' }}>
        Bei „Gesperrt“ sehen Besucher über den Link nur die Details, nicht den Inhalt.
      </p>
    </div>
  )
}
