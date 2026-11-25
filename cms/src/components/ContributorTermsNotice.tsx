'use client'

import { useAuth, useConfig } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Reminder for accounts that still have to accept the contributor terms (src/lib/contributor-terms.ts):
//   variant "action"     – short link at the top right, next to "Log out"
//   variant "dashboard"  – box above the dashboard
// Shows nothing for admins and for accounts that have accepted the current version.

export function ContributorTermsNotice({ variant = 'action' }: { variant?: 'action' | 'dashboard' }) {
  const {
    config: {
      routes: { admin, api },
    },
  } = useConfig()
  const { user } = useAuth()
  const [needed, setNeeded] = useState(false)

  useEffect(() => {
    if (!user) {
      return
    }

    fetch(`${api}/users/contributor-terms`, { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((terms: { required?: boolean; accepted?: boolean } | null) => setNeeded(Boolean(terms?.required && !terms.accepted)))
      .catch(() => setNeeded(false))
  }, [api, user])

  if (!needed) {
    return null
  }

  const link = `${admin}/account`

  if (variant === 'action') {
    return (
      <a href={link} style={{ marginRight: 'var(--base)', color: 'var(--theme-error-500)', fontWeight: 600 }}>
        Accept the contributor terms
      </a>
    )
  }

  return (
    <div
      style={{
        marginBottom: 'calc(var(--base) * 1.5)',
        padding: 'var(--base)',
        border: '1px solid var(--theme-error-500)',
        borderRadius: 'var(--style-radius-m)',
      }}
    >
      <p style={{ margin: '0 0 calc(var(--base) / 2)', fontWeight: 600 }}>Please accept the contributor terms first</p>
      <p style={{ margin: 0 }}>
        Before you can upload photos or change exhibitions, read and accept the terms on your{' '}
        <a href={link}>account page</a>. They make you responsible for what you upload.
      </p>
    </div>
  )
}
