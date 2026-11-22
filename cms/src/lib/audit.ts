// "Created by" / "Last changed by" fields, set automatically from the logged-in account.
// Nobody can set them by hand (field access create/update: false); the hook writes them.
// Only logged-in accounts can read them, so the public API does not reveal account ids.
import type { CollectionBeforeChangeHook, Field } from 'payload'

import { getUserId, loggedInField } from '../access/roles'

export function auditFields(options: { updatedBy?: boolean } = {}): Field[] {
  const fields: Field[] = [
    {
      name: 'createdBy',
      label: 'Created by',
      type: 'relationship',
      relationTo: 'users',
      access: { read: loggedInField, create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ]

  if (options.updatedBy !== false) {
    fields.push({
      name: 'updatedBy',
      label: 'Last changed by',
      type: 'relationship',
      relationTo: 'users',
      access: { read: loggedInField, create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    })
  }

  return fields
}

export function auditHook(options: { updatedBy?: boolean } = {}): CollectionBeforeChangeHook {
  return ({ data, operation, req }) => {
    const userId = getUserId(req.user)

    if (userId === null) {
      return data
    }

    if (operation === 'create') {
      data.createdBy = userId
    }

    if (options.updatedBy !== false) {
      data.updatedBy = userId
    }

    return data
  }
}
