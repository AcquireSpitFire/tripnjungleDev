// Checks the permission matrix (src/access/roles.ts) against a TEMPORARY database
// and media folder – the real tripnjungle.db is never touched:
//   cd cms && npm run test:access
// Every check prints ✓ or ✗; the exit code is 1 if any check fails.
import fs from 'fs'
import os from 'os'
import path from 'path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-access-'))

process.env.DATABASE_URI = 'file:' + path.join(tempDir, 'test.db').replace(/\\/g, '/')
process.env.MEDIA_DIR = path.join(tempDir, 'media')
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'access-test-secret'

let failures = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log('  ✓ ' + name)
  } else {
    failures += 1
    console.log('  ✗ ' + name + (detail === undefined ? '' : ' → ' + JSON.stringify(detail)))
  }
}

async function fails(name: string, action: () => Promise<unknown>) {
  try {
    await action()
    check(name, false, 'no error')
  } catch {
    check(name, true)
  }
}

async function run() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const sharp = (await import('sharp')).default
  const payload = await getPayload({ config })

  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } }).png().toBuffer()
  let fileCounter = 0
  const file = () => ({ data: png, mimetype: 'image/png', name: `test-${++fileCounter}.png`, size: png.length })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyDoc = any
  const as = (user: AnyDoc) => ({ user, overrideAccess: false as const })

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

  console.log('Exhibitions')

  const imageA: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'A' }, file: file(), ...as(manager) })
  const imageB: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'B' }, file: file(), ...as(manager) })
  const poster: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'P' }, file: file(), ...as(manager) })

  check('new uploads are locked', imageA.locked === true, imageA.locked)
  check('uploads remember who created them', String(imageA.createdBy?.id ?? imageA.createdBy) === String(manager.id))

  await fails('a manager without the section cannot create exhibitions', () =>
    payload.create({ collection: 'exhibitions', data: { slug: 'nope', title: 'Nope' }, ...as(managerWithoutSection) }),
  )
  await fails('an editor cannot create exhibitions', () =>
    payload.create({ collection: 'exhibitions', data: { slug: 'nope', title: 'Nope' }, ...as(editor) }),
  )

  const open: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'open-one',
      title: 'Open',
      visibility: 'public',
      release: 'scheduled',
      posters: [poster.id],
      gallery: [{ file: imageA.id }, { file: imageB.id }],
    },
    ...as(manager),
  })
  const locked: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: { slug: 'locked-one', title: 'Locked', visibility: 'locked', gallery: [{ file: imageA.id }] },
    ...as(manager),
  })
  const planning: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: { slug: 'planning-one', title: 'Planning', release: 'planning', visibility: 'public' },
    ...as(manager),
  })

  check('exhibitions remember who created them', String(open.createdBy?.id ?? open.createdBy) === String(manager.id))

  const reload = (id: number | string) => payload.findByID({ collection: 'media', id, overrideAccess: true })

  check('an image in a public exhibition is public', (await reload(imageA.id)).locked === false)
  check('a poster outside "planning" is public', (await reload(poster.id)).locked === false)

  const anonymous = await payload.find({ collection: 'exhibitions', overrideAccess: false, depth: 0 })
  const anonymousSlugs = anonymous.docs.map((doc: AnyDoc) => doc.slug)

  check('visitors do not see "planning"', !anonymousSlugs.includes('planning-one'), anonymousSlugs)
  check('visitors see locked exhibitions (details)', anonymousSlugs.includes('locked-one'), anonymousSlugs)

  const anonymousLocked: AnyDoc = anonymous.docs.find((doc: AnyDoc) => doc.slug === 'locked-one')

  check('visitors do not get the gallery of a locked exhibition', !anonymousLocked?.gallery?.length, anonymousLocked?.gallery)

  const editorSees = await payload.find({ collection: 'exhibitions', ...as(editor) })

  check('an unassigned editor sees no exhibitions', editorSees.docs.length === 0, editorSees.docs.length)
  await fails('an unassigned editor cannot change an exhibition', () =>
    payload.update({ collection: 'exhibitions', id: open.id, data: { title: 'hacked' }, ...as(editor) }),
  )
  await fails('an editor cannot delete an exhibition', () =>
    payload.delete({ collection: 'exhibitions', id: open.id, ...as(editor) }),
  )

  const managerSees = await payload.find({ collection: 'exhibitions', ...as(manager) })

  check('a manager sees all exhibitions', managerSees.docs.length === 3, managerSees.docs.length)

  console.log('Media lock')

  await payload.update({
    collection: 'exhibitions',
    id: open.id,
    data: { gallery: [{ file: imageB.id }] },
    ...as(manager),
  })
  check(
    'an image removed from the only public exhibition is locked again (still used by a locked one)',
    (await reload(imageA.id)).locked === true,
  )

  await payload.update({ collection: 'exhibitions', id: locked.id, data: { visibility: 'link' }, ...as(manager) })
  check('"locked with link" makes its gallery public', (await reload(imageA.id)).locked === false)

  await payload.update({ collection: 'exhibitions', id: locked.id, data: { visibility: 'locked' }, ...as(manager) })
  check('locking it again locks the image', (await reload(imageA.id)).locked === true)

  const forced: AnyDoc = await payload.update({
    collection: 'media',
    id: imageA.id,
    data: { locked: false },
    ...as(manager),
  })
  check('"locked" cannot be changed through the API', forced.locked === true, forced.locked)

  const anonymousMedia = await payload.find({ collection: 'media', overrideAccess: false })
  const anonymousMediaIds = anonymousMedia.docs.map((doc: AnyDoc) => String(doc.id))

  check('visitors cannot read locked media', !anonymousMediaIds.includes(String(imageA.id)), anonymousMediaIds)
  check('visitors can read public media', anonymousMediaIds.includes(String(imageB.id)), anonymousMediaIds)

  const editorMedia = await payload.find({ collection: 'media', ...as(editor) })
  const editorMediaIds = editorMedia.docs.map((doc: AnyDoc) => String(doc.id))

  check('an unassigned editor cannot read locked media', !editorMediaIds.includes(String(imageA.id)), editorMediaIds)

  await payload.delete({ collection: 'exhibitions', id: open.id, ...as(manager) })
  check('deleting the exhibition locks its media', (await reload(imageB.id)).locked === true)

  void planning

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
}

run()
  .catch((error) => {
    console.error(error)
    failures += 1
  })
  .finally(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // the database file may still be open on Windows; the OS cleans up the temp folder
    }

    process.exit(failures ? 1 : 0)
  })
