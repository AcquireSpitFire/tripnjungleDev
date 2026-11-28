'use client'

import { useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useState } from 'react'

import { photoShortUrl } from '../lib/short-link'
import { copyImageFromUrl, qrEndpoint, qrWarnings, refId } from './qr-helpers'

// QR code of one photo, inside its row of "Images and videos":
// preview, "Copy QR image", "Copy link" and "Download PDF" (printable label).
// Works once the photo is saved in the exhibition, because the code is generated
// from the saved state on the server.
export const QrCodeField: UIFieldClientComponent = ({ path }) => {
  const { id, initialData } = useDocumentInfo()
  const { config } = useConfig()
  const filePath = path.replace(/qrCode$/, 'file')
  const fileValue = useFormFields(([fields]) => fields[filePath]?.value)
  const visibility = useFormFields(([fields]) => fields.visibility?.value)
  const release = useFormFields(([fields]) => fields.release?.value)
  const [status, setStatus] = useState('')

  const mediaId = refId(fileValue)

  if (!id || !mediaId) {
    return null
  }

  const savedRows = (initialData?.gallery || []) as { file?: unknown }[]
  const saved = savedRows.some((row) => refId(row.file) === mediaId)

  if (!saved) {
    return (
      <p className="field-description" style={{ margin: '0 0 var(--base)' }}>
        QR code: available after saving the exhibition.
      </p>
    )
  }

  const api = config.routes.api
  const serverURL = config.serverURL || window.location.origin
  const pngUrl = qrEndpoint(api, id, { format: 'png', media: mediaId })
  const pdfUrl = qrEndpoint(api, id, { format: 'pdf', media: mediaId })
  const shortUrl = photoShortUrl(serverURL, mediaId)
  const warnings = qrWarnings({ visibility, release, serverURL })

  function flash(message: string) {
    setStatus(message)
    setTimeout(() => setStatus(''), 2500)
  }

  async function copyImage() {
    flash(
      (await copyImageFromUrl(pngUrl))
        ? 'QR image copied ✓'
        : 'Copying images is not supported here – use “Download PDF”.',
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shortUrl)
      flash('Link copied ✓')
    } catch {
      flash('Clipboard blocked – select the link by hand.')
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">QR code</label>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <img
          src={pngUrl}
          alt={`QR code for ${shortUrl}`}
          width={96}
          height={96}
          style={{ background: '#fff', borderRadius: 4, flex: 'none' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
          <input
            readOnly
            value={shortUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Short link of this photo"
            style={{ width: '100%', maxWidth: 320 }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--style-secondary btn--size-small"
              style={{ margin: 0 }}
              onClick={copyImage}
            >
              Copy QR image
            </button>
            <button
              type="button"
              className="btn btn--style-secondary btn--size-small"
              style={{ margin: 0 }}
              onClick={copyLink}
            >
              Copy link
            </button>
            <a
              className="btn btn--style-secondary btn--size-small"
              style={{ margin: 0 }}
              href={pdfUrl}
              download
            >
              Download PDF
            </a>
          </div>
          {status ? (
            <p className="field-description" role="status" style={{ margin: 0 }}>
              {status}
            </p>
          ) : null}
        </div>
      </div>
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
