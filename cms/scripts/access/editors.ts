// Access checks – Editors (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkEditors(t: Context): Promise<void> {
  const { payload, file, as, check, fails } = t
  const { editor, imageA, locked, manager, profile, reload } = t.f

  console.log('Editors')

  // "locked" (from above) still uses imageA, which is locked
  await fails('an editor cannot assign themselves', () =>
    payload.update({
      collection: 'exhibitions',
      id: locked.id,
      data: { editors: [editor.id] },
      ...as(editor),
    }),
  )

  const assigned: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: locked.id,
    data: { editors: [editor.id] },
    ...as(manager),
  })

  check(
    'a manager can assign an editor',
    (assigned.editors || []).some((ref: AnyDoc) => String(ref?.id ?? ref) === String(editor.id)),
  )
  await fails('only editor or artist accounts can be assigned', () =>
    payload.update({
      collection: 'exhibitions',
      id: locked.id,
      data: { editors: [manager.id] },
      ...as(manager),
    }),
  )

  const editorList = await payload.find({ collection: 'exhibitions', ...as(editor) })

  check(
    'an assigned editor sees exactly their exhibition',
    editorList.docs.length === 1 && editorList.docs[0].slug === 'locked-one',
    editorList.docs.map((doc: AnyDoc) => doc.slug),
  )

  const editorMediaNow = await payload.find({ collection: 'media', ...as(editor) })

  check(
    'an assigned editor can read the locked media of their exhibition',
    editorMediaNow.docs.some((doc: AnyDoc) => String(doc.id) === String(imageA.id)),
  )

  const editorUpload: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Editor upload', rightsConfirmed: true },
    file: file(),
    ...as(editor),
  })
  const edited: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: locked.id,
    data: {
      title: 'Edited by editor',
      description: 'New text',
      gallery: [
        { file: imageA.id, name: 'Caption' },
        { file: editorUpload.id, alt: 'New photo' },
      ],
      visibility: 'public',
      release: 'planning',
      slug: 'renamed-by-editor',
      artists: [profile.id],
      editors: [],
    },
    ...as(editor),
  })

  check(
    'an editor can change texts',
    edited.title === 'Edited by editor' && edited.description === 'New text',
  )
  check(
    'an editor can add their own photos and captions',
    edited.gallery?.length === 2 && edited.gallery[0].name === 'Caption',
  )
  check(
    'an editor cannot change visibility or release',
    edited.visibility === 'locked' && edited.release === 'scheduled',
    [edited.visibility, edited.release],
  )
  check('an editor cannot change the ID', edited.slug === 'locked-one', edited.slug)
  check('an editor cannot change the credited artists', !edited.artists?.length, edited.artists)
  check('an editor cannot remove the assignments', edited.editors?.length === 1, edited.editors)
  check(
    'a photo added to a locked exhibition stays locked',
    (await reload(editorUpload.id)).locked === true,
  )
  await fails('an editor cannot delete an assigned exhibition', () =>
    payload.delete({ collection: 'exhibitions', id: locked.id, ...as(editor) }),
  )
  await fails('an editor cannot delete media of others', () =>
    payload.delete({ collection: 'media', id: imageA.id, ...as(editor) }),
  )

  const anonymousEditors: AnyDoc = await payload.findByID({
    collection: 'exhibitions',
    id: locked.id,
    overrideAccess: false,
  })

  check(
    'visitors do not see who the editors are',
    anonymousEditors.editors === undefined,
    anonymousEditors.editors,
  )

  Object.assign(t.f, { editorUpload })
}
