// Access checks – Accounts (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkAccounts(t: Context): Promise<void> {
  const { payload, as, check, fails } = t

  console.log('Accounts')

  const admin: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'admin@test.local', password: 'admin-password-123', role: 'editor' },
  })
  check('the first account always becomes admin', admin.role === 'admin', admin.role)

  await fails('passwords shorter than 12 characters are rejected', () =>
    payload.create({ collection: 'users', data: { email: 'short@test.local', password: 'short', role: 'editor' } }),
  )

  const manager: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'manager@test.local', password: 'manager-password-1', role: 'manager', sections: ['exhibitions'] },
    ...as(admin),
  })
  const managerWithoutSection: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'nosection@test.local', password: 'manager-password-2', role: 'manager', sections: [] },
    ...as(admin),
  })
  const editor: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'editor@test.local', password: 'editor-password-1', role: 'editor' },
    ...as(admin),
  })

  await fails('an editor cannot create accounts', () =>
    payload.create({
      collection: 'users',
      data: { email: 'x@test.local', password: 'x-password-12345', role: 'admin' },
      ...as(editor),
    }),
  )
  await fails('a manager cannot create accounts', () =>
    payload.create({
      collection: 'users',
      data: { email: 'y@test.local', password: 'y-password-12345', role: 'editor' },
      ...as(manager),
    }),
  )

  const selfPromoted: AnyDoc = await payload.update({
    collection: 'users',
    id: editor.id,
    data: { role: 'admin', name: 'Eddie' },
    ...as(editor),
  })
  check('an editor cannot change their own role', selfPromoted.role === 'editor', selfPromoted.role)
  check('an editor can change their own name', selfPromoted.name === 'Eddie', selfPromoted.name)

  await fails('an editor cannot change another account', () =>
    payload.update({ collection: 'users', id: manager.id, data: { name: 'hacked' }, ...as(editor) }),
  )
  await fails('the last admin cannot be demoted', () =>
    payload.update({ collection: 'users', id: admin.id, data: { role: 'editor' }, ...as(admin) }),
  )
  await fails('the last admin cannot be deleted', () =>
    payload.delete({ collection: 'users', id: admin.id, ...as(admin) }),
  )

  const editorReadsUsers = await payload.find({ collection: 'users', ...as(editor) })
  check('an editor only sees their own account', editorReadsUsers.docs.length === 1, editorReadsUsers.docs.length)

  await fails('a manager cannot read the site settings', () => payload.findGlobal({ slug: 'site', ...as(manager) }))
  await fails('a manager cannot change the site settings', () =>
    payload.updateGlobal({ slug: 'site', data: { aboutText: 'hacked' }, ...as(manager) }),
  )

  Object.assign(t.f, { admin, manager, managerWithoutSection, editor })
}
