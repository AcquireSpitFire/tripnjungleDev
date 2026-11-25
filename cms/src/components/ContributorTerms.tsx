'use client'

import { useAuth, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

// Account page (sidebar): the contributor terms and the "I accept" button – only on the own
// account; for other accounts the fields below show whether and when they accepted.
// Data: GET /api/users/contributor-terms, accepting: POST …/accept (src/collections/Users.ts).

type Terms = { required: boolean; accepted: boolean; acceptedAt: string | null; text: string; version: string }

export function ContributorTerms() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig()
  const { user } = useAuth()
  const { id } = useDocumentInfo()
  const [terms, setTerms] = useState<Terms | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const ownAccount = Boolean(user && id !== undefined && String(user.id) === String(id))

  const load = useCallback(async () => {
    const response = await fetch(`${api}/users/contributor-terms`, { credentials: 'same-origin', cache: 'no-store' })

    if (response.ok) {
      setTerms((await response.json()) as Terms)
    }
  }, [api])

  useEffect(() => {
    if (ownAccount) {
      void load()
    }
  }, [ownAccount, load])

  if (!ownAccount || !terms?.required) {
    return null
  }

  async function accept() {
    if (!terms) {
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const response = await fetch(`${api}/users/contributor-terms/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: terms.version }),
      })
      const result = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error || 'Accepting did not work.')
      }

      // Reload so the stored date and the notice at the top update
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Accepting did not work.')
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p style={{ margin: '0 0 calc(var(--base) / 2)', fontWeight: 600 }}>Contributor terms</p>
      {terms.accepted ? (
        <p style={{ margin: 0 }}>
          Accepted on {terms.acceptedAt ? new Date(terms.acceptedAt).toLocaleString('en-GB') : '–'}. You are responsible
          for what you upload and change (see the copy below).
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 calc(var(--base) / 2)' }}>
            Please read and accept these terms. Until then you cannot upload or change anything.
          </p>
          <div
            style={{
              maxHeight: '22rem',
              overflowY: 'auto',
              padding: 'calc(var(--base) / 2)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 'var(--style-radius-s)',
              whiteSpace: 'pre-wrap',
              fontSize: '0.85rem',
              lineHeight: 1.5,
            }}
          >
            {terms.text.replace(/^## /gm, '')}
          </div>
          {message && <p style={{ color: 'var(--theme-error-500)' }}>{message}</p>}
          <button
            type="button"
            className="btn btn--style-primary btn--size-small"
            style={{ marginTop: 'calc(var(--base) / 2)' }}
            disabled={busy}
            onClick={accept}
          >
            I have read and accept these terms
          </button>
        </>
      )}
    </div>
  )
}
