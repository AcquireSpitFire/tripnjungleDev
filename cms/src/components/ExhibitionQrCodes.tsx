'use client'

import { useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'

import { qrEndpoint, qrWarnings, refId } from './qr-helpers'

// Exhibition sidebar: all QR codes of the saved photos as one PDF (one label per page).
export function ExhibitionQrCodes() {
  const { id, initialData } = useDocumentInfo()
  const { config } = useConfig()
  const visibility = useFormFields(([fields]) => fields.visibility?.value)
  const release = useFormFields(([fields]) => fields.release?.value)

  const count = ((initialData?.gallery || []) as { file?: unknown }[]).filter((row) =>
    refId(row.file),
  ).length

  if (!id) {
    return null
  }

  const serverURL = config.serverURL || window.location.origin
  const warnings = qrWarnings({ visibility, release, serverURL })

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">QR codes</label>
      {count ? (
        <a
          className="btn btn--style-secondary btn--size-small"
          style={{ margin: 0 }}
          href={qrEndpoint(config.routes.api, id, { format: 'pdf' })}
          download
        >
          All {count} QR codes as PDF
        </a>
      ) : (
        <p className="field-description" style={{ margin: 0 }}>
          Save photos under “Images and videos” first.
        </p>
      )}
      <p className="field-description" style={{ marginTop: '0.5rem' }}>
        One label per page. Size and texts: Site settings → QR codes. Single codes are in each photo
        row.
      </p>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="field-description"
          style={{ margin: '0.5rem 0 0', color: 'var(--theme-warning-500)' }}
        >
          {warning}
        </p>
      ))}
    </div>
  )
}
