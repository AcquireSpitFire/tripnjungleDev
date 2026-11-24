'use client'

import { useAuth, useConfig } from '@payloadcms/ui'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  artist: 'Artist',
  editor: 'Editor',
}

type AccountUser = { email?: string; name?: string | null; role?: string | null }

// Top right of the admin panel: who is logged in, plus a clearly labelled "Log out" button.
// Payload's own logout view ends the session on the server (useSessions) and clears the cookie.
export function LogoutAction() {
  const { user } = useAuth<AccountUser>()
  const {
    config: {
      routes: { admin },
      admin: {
        routes: { logout },
      },
    },
  } = useConfig()

  if (!user) {
    return null
  }

  const name = user.name || user.email || ''
  const role = user.role ? ROLE_LABELS[user.role] || user.role : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ fontSize: '0.85rem', opacity: 0.75, whiteSpace: 'nowrap' }}>
        {name}
        {role ? ` · ${role}` : ''}
      </span>
      <a className="btn btn--style-secondary btn--size-small" href={`${admin}${logout}`} style={{ margin: 0 }}>
        Log out
      </a>
    </div>
  )
}
