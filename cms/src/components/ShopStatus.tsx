'use client'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

// Site settings → Shop, at the top: is the shop open for visitors, and if not, what is missing.
// Data from GET /api/globals/site/shop-status (src/globals/Site.ts, src/lib/shop/settings.ts).
// Shows the saved state; it reloads after every save.

type Item = { label: string; ok: boolean; required: boolean; hint: string }
type Status = { open: boolean; items: Item[] }

export function ShopStatus() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig()
  const { lastUpdateTime } = useDocumentInfo()
  const [status, setStatus] = useState<Status | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${api}/globals/site/shop-status`, { credentials: 'same-origin', cache: 'no-store' })

      if (!response.ok) {
        throw new Error(String(response.status))
      }

      setStatus((await response.json()) as Status)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load, lastUpdateTime])

  if (failed) {
    return <p style={{ marginBottom: 'var(--base)' }}>The shop status could not be loaded.</p>
  }

  if (!status) {
    return null
  }

  const missing = status.items.filter((item) => item.required && !item.ok)

  return (
    <div
      style={{
        marginBottom: 'calc(var(--base) * 1.5)',
        padding: 'var(--base)',
        border: `1px solid ${status.open ? 'var(--theme-success-500)' : 'var(--theme-warning-500)'}`,
        borderRadius: 'var(--style-radius-m)',
      }}
    >
      <p style={{ margin: '0 0 calc(var(--base) / 2)', fontWeight: 600 }}>
        {status.open
          ? 'The shop is open: visitors see the prints and can order.'
          : `The shop is closed for visitors – ${missing.length} required item${missing.length === 1 ? '' : 's'} missing. You can still check the prints in the exhibition preview (“Preview (with your login)”).`}
      </p>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
        {status.items.map((item) => (
          <li key={item.label} style={{ margin: '0.25rem 0' }}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: '1.5em' }}>
              {item.ok ? '✓' : item.required ? '✗' : '!'}
            </span>
            {item.label}
            {item.ok ? '' : item.required ? ' – required' : ' – recommended'}
            {!item.ok && (
              <span style={{ display: 'block', paddingLeft: '1.5em', color: 'var(--theme-elevation-500)' }}>{item.hint}</span>
            )}
          </li>
        ))}
      </ul>
      <p style={{ margin: 'calc(var(--base) / 2) 0 0', color: 'var(--theme-elevation-500)' }}>
        Shows the saved settings. Server variables need a restart of the server to count.
      </p>
    </div>
  )
}
