// Access checks – Exhibitions (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkExhibitions(t: Context): Promise<void> {
  const { payload, file, as, check, fails } = t
  const { editor, manager, managerWithoutSection } = t.f

  console.log('Exhibitions')

  const imageA: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'A', rightsConfirmed: true }, file: file(), ...as(manager) })
  const imageB: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'B', rightsConfirmed: true }, file: file(), ...as(manager) })
  const poster: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'P', rightsConfirmed: true }, file: file(), ...as(manager) })

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

  Object.assign(t.f, { imageA, imageB, open, locked, planning, reload })
}
