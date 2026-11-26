// Access checks – Media lock (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkMediaLock(t: Context): Promise<void> {
  const { payload, file, as, check } = t
  const { editor, imageA, imageB, locked, manager, open, planning, reload } = t.f

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
}
