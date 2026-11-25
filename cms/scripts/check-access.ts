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
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'access-test-secret-only-for-the-temporary-db'

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

  console.log('Artists')

  const portrait: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'Portrait' }, file: file(), ...as(manager) })
  const profile: AnyDoc = await payload.create({
    collection: 'artists',
    data: {
      name: 'Ana',
      pageType: 'profile',
      slug: 'ana',
      portrait: portrait.id,
      contactVia: 'artist',
      contactEmail: 'ana@test.local',
      contactConsent: false,
    },
    ...as(manager),
  })
  const otherProfile: AnyDoc = await payload.create({
    collection: 'artists',
    data: { name: 'Ben', slug: 'ben', pageType: 'external', externalUrl: 'https://example.com' },
    ...as(manager),
  })

  check('a portrait is public once a profile uses it', (await reload(portrait.id)).locked === false)
  await fails('an editor cannot create artist profiles', () =>
    payload.create({ collection: 'artists', data: { name: 'X', slug: 'x', pageType: 'profile' }, ...as(editor) }),
  )
  await fails('external pages need an https address', () =>
    payload.create({
      collection: 'artists',
      data: { name: 'Y', slug: 'y', pageType: 'external', externalUrl: 'javascript:alert(1)' },
      ...as(manager),
    }),
  )

  const hidden: AnyDoc = await payload.findByID({ collection: 'artists', id: profile.id, overrideAccess: false })

  check('without consent visitors do not get the contact e-mail', !hidden.contactEmail, hidden.contactEmail)

  await payload.update({ collection: 'artists', id: profile.id, data: { contactConsent: true }, ...as(manager) })

  const shown: AnyDoc = await payload.findByID({ collection: 'artists', id: profile.id, overrideAccess: false })

  check('with consent visitors get the contact e-mail', shown.contactEmail === 'ana@test.local', shown.contactEmail)

  const artistUser: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'ana@test.local', password: 'artist-password-1', role: 'artist', artist: profile.id },
    ...as(admin),
  })

  const artistImage: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Ana 1' },
    file: file(),
    ...as(artistUser),
  })

  await fails('an artist cannot use locked media of others in a new exhibition', () =>
    payload.create({
      collection: 'exhibitions',
      data: { slug: 'ana-steal', title: 'Steal', gallery: [{ file: imageB.id }] },
      ...as(artistUser),
    }),
  )

  const own: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'ana-show',
      title: 'Ana show',
      release: 'scheduled',
      visibility: 'public',
      artists: [otherProfile.id],
      gallery: [{ file: artistImage.id }],
    },
    ...as(artistUser),
  })

  check('an artist exhibition always starts as "planning"', own.release === 'planning', own.release)
  check('an artist exhibition always starts locked', own.visibility === 'locked', own.visibility)
  check(
    'an artist exhibition is credited to their own profile only',
    own.artists?.length === 1 && String(own.artists[0]?.id ?? own.artists[0]) === String(profile.id),
    own.artists,
  )

  const published: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: own.id,
    data: { visibility: 'public', release: 'scheduled', title: 'Ana show 2' },
    ...as(artistUser),
  })

  check('an artist can change the content of their exhibition', published.title === 'Ana show 2', published.title)
  check('an artist cannot publish', published.visibility === 'locked' && published.release === 'planning', [
    published.visibility,
    published.release,
  ])

  const renamed: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: own.id,
    data: { slug: 'other-slug' },
    ...as(artistUser),
  })

  check('an artist cannot change the ID of an exhibition', renamed.slug === 'ana-show', renamed.slug)
  await fails('an artist cannot delete their exhibition', () =>
    payload.delete({ collection: 'exhibitions', id: own.id, ...as(artistUser) }),
  )

  const artistSees = await payload.find({ collection: 'exhibitions', ...as(artistUser) })

  check(
    'an artist only sees exhibitions that credit them',
    artistSees.docs.length === 1 && artistSees.docs[0].slug === 'ana-show',
    artistSees.docs.map((doc: AnyDoc) => doc.slug),
  )
  await fails('an artist cannot change exhibitions of others', () =>
    payload.update({ collection: 'exhibitions', id: locked.id, data: { title: 'hacked' }, ...as(artistUser) }),
  )

  const ownProfile: AnyDoc = await payload.update({
    collection: 'artists',
    id: profile.id,
    data: { shortText: 'Hello', slug: 'renamed' },
    ...as(artistUser),
  })

  check('an artist can edit their own profile', ownProfile.shortText === 'Hello', ownProfile.shortText)
  check('an artist cannot change the ID of their profile', ownProfile.slug === 'ana', ownProfile.slug)
  await fails('an artist cannot edit other profiles', () =>
    payload.update({ collection: 'artists', id: otherProfile.id, data: { name: 'hacked' }, ...as(artistUser) }),
  )

  const relinked: AnyDoc = await payload.update({
    collection: 'users',
    id: artistUser.id,
    data: { artist: otherProfile.id },
    ...as(artistUser),
  })

  check(
    'an artist cannot link their account to another profile',
    String(relinked.artist?.id ?? relinked.artist) === String(profile.id),
    relinked.artist,
  )

  await fails('an artist cannot attach locked media of others', () =>
    payload.update({
      collection: 'exhibitions',
      id: own.id,
      data: { gallery: [{ file: imageA.id }] },
      ...as(artistUser),
    }),
  )

  console.log('Editors')

  // "locked" (from above) still uses imageA, which is locked
  await fails('an editor cannot assign themselves', () =>
    payload.update({ collection: 'exhibitions', id: locked.id, data: { editors: [editor.id] }, ...as(editor) }),
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
    payload.update({ collection: 'exhibitions', id: locked.id, data: { editors: [manager.id] }, ...as(manager) }),
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
    data: { alt: 'Editor upload' },
    file: file(),
    ...as(editor),
  })
  const edited: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: locked.id,
    data: {
      title: 'Edited by editor',
      description: 'New text',
      gallery: [{ file: imageA.id, name: 'Caption' }, { file: editorUpload.id, alt: 'New photo' }],
      visibility: 'public',
      release: 'planning',
      slug: 'renamed-by-editor',
      artists: [profile.id],
      editors: [],
    },
    ...as(editor),
  })

  check('an editor can change texts', edited.title === 'Edited by editor' && edited.description === 'New text')
  check('an editor can add their own photos and captions', edited.gallery?.length === 2 && edited.gallery[0].name === 'Caption')
  check('an editor cannot change visibility or release', edited.visibility === 'locked' && edited.release === 'scheduled', [
    edited.visibility,
    edited.release,
  ])
  check('an editor cannot change the ID', edited.slug === 'locked-one', edited.slug)
  check('an editor cannot change the credited artists', !edited.artists?.length, edited.artists)
  check('an editor cannot remove the assignments', edited.editors?.length === 1, edited.editors)
  check('a photo added to a locked exhibition stays locked', (await reload(editorUpload.id)).locked === true)
  await fails('an editor cannot delete an assigned exhibition', () =>
    payload.delete({ collection: 'exhibitions', id: locked.id, ...as(editor) }),
  )
  await fails('an editor cannot delete media of others', () =>
    payload.delete({ collection: 'media', id: imageA.id, ...as(editor) }),
  )

  const anonymousEditors: AnyDoc = await payload.findByID({ collection: 'exhibitions', id: locked.id, overrideAccess: false })

  check('visitors do not see who the editors are', anonymousEditors.editors === undefined, anonymousEditors.editors)

  console.log('QR codes')

  const { createLocalReq } = await import('payload')
  const { exhibitionQrEndpoint } = await import('../src/endpoints/exhibition-qr')
  const { PDFDocument } = await import('pdf-lib')

  const qr = async (user: AnyDoc, exhibitionId: number | string, query: string) => {
    const req = await createLocalReq(
      { user: user || undefined, urlSuffix: `/api/exhibitions/${exhibitionId}/qr?${query}`, req: { routeParams: { id: String(exhibitionId) } } },
      payload,
    )

    if (!user) {
      req.user = null
    }

    return exhibitionQrEndpoint.handler(req) as Promise<Response>
  }

  const allPdf = await qr(manager, locked.id, 'format=pdf')
  const allBytes = new Uint8Array(await allPdf.arrayBuffer())
  const allDoc = allPdf.status === 200 ? await PDFDocument.load(allBytes) : null

  check('a manager gets the PDF of all photos', allPdf.headers.get('content-type') === 'application/pdf', allPdf.status)
  check('the PDF has one label per photo', allDoc?.getPageCount() === 2, allDoc?.getPageCount())

  const [labelWidth, labelHeight] = allDoc ? [allDoc.getPage(0).getWidth(), allDoc.getPage(0).getHeight()] : [0, 0]

  check('labels are A6 by default (105 × 148 mm)', Math.round(labelWidth) === 298 && Math.round(labelHeight) === 420, [labelWidth, labelHeight])

  await payload.updateGlobal({ slug: 'site', data: { qrFormat: 'square100' }, overrideAccess: true })

  const squarePdf = await qr(manager, locked.id, `format=pdf&media=${imageA.id}`)
  const squareDoc = await PDFDocument.load(new Uint8Array(await squarePdf.arrayBuffer()))

  check('the label size follows the Site settings', Math.round(squareDoc.getPage(0).getWidth()) === 283, squareDoc.getPage(0).getWidth())
  check('a single photo gives a single label', squareDoc.getPageCount() === 1, squareDoc.getPageCount())

  const qrImage = await qr(editor, locked.id, `format=png&media=${imageA.id}`)
  const pngBytes = new Uint8Array(await qrImage.arrayBuffer())

  check('an assigned editor gets the QR image', qrImage.status === 200 && qrImage.headers.get('content-type') === 'image/png', qrImage.status)
  check('the QR image is a PNG', pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e)
  check('QR responses are not cached', (qrImage.headers.get('cache-control') || '').includes('no-store'))
  check('visitors get no QR codes', (await qr(null, locked.id, 'format=pdf')).status === 401)
  check('an artist gets no QR codes of other exhibitions', (await qr(artistUser, locked.id, 'format=pdf')).status === 404)
  check('photos outside the exhibition get no QR code', (await qr(manager, locked.id, `format=png&media=${portrait.id}`)).status === 404)
  check('invalid parameters are rejected', (await qr(manager, locked.id, 'format=svg')).status === 400)

  const { photoShortUrl, isTemporaryAddress } = await import('../src/lib/short-link')

  check('the QR link is the short link /p/<id>', photoShortUrl('https://tripnjungle.com/', 42) === 'https://tripnjungle.com/p/42')
  check('localhost counts as a temporary address', isTemporaryAddress('http://localhost:3000'))
  check('Railway addresses count as temporary', isTemporaryAddress('https://tj-production.up.railway.app'))
  check('the real domain is not temporary', !isTemporaryAddress('https://tripnjungle.com'))

  console.log('Security')

  // Locked photos must not become public through artists/editors
  const managerPhoto: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'M' }, file: file(), ...as(manager) })

  await payload.update({
    collection: 'exhibitions',
    id: own.id,
    data: { gallery: [{ file: artistImage.id }, { file: managerPhoto.id }] },
    ...as(manager),
  })
  await fails('an artist cannot make a locked photo of their exhibition public as portrait', () =>
    payload.update({ collection: 'artists', id: profile.id, data: { portrait: managerPhoto.id }, ...as(artistUser) }),
  )
  check('the photo stays locked', (await reload(managerPhoto.id)).locked === true)

  const ownPortrait: AnyDoc = await payload.update({
    collection: 'artists',
    id: profile.id,
    data: { portrait: artistImage.id },
    ...as(artistUser),
  })

  check('an artist can use their own upload as portrait', String(ownPortrait.portrait?.id ?? ownPortrait.portrait) === String(artistImage.id))

  const publicElsewhere: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'Pub' }, file: file(), ...as(manager) })
  const editorOpen: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: { slug: 'editor-open', title: 'Editor open', visibility: 'public', editors: [editor.id] },
    ...as(manager),
  })

  await payload.create({
    collection: 'exhibitions',
    data: { slug: 'other-open', title: 'Other open', visibility: 'public', gallery: [{ file: publicElsewhere.id }] },
    ...as(manager),
  })

  await fails('an editor cannot move a locked photo into a public exhibition', () =>
    payload.update({ collection: 'exhibitions', id: editorOpen.id, data: { gallery: [{ file: imageA.id }] }, ...as(editor) }),
  )
  await fails('an editor cannot make a locked photo public as poster', () =>
    payload.update({ collection: 'exhibitions', id: locked.id, data: { posters: [imageA.id] }, ...as(editor) }),
  )
  check('the locked photo stays locked', (await reload(imageA.id)).locked === true)

  const withPublic: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: editorOpen.id,
    data: { gallery: [{ file: publicElsewhere.id }, { file: editorUpload.id }] },
    ...as(editor),
  })

  check('an editor can add public photos and their own uploads', withPublic.gallery?.length === 2, withPublic.gallery?.length)

  const resaved: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: locked.id,
    data: { title: 'Saved again' },
    ...as(editor),
  })

  check('saving an exhibition that already holds locked photos still works', resaved.title === 'Saved again')

  const lockedFlag: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: editorOpen.id,
    data: { locked: true },
    ...as(editor),
  })

  check('an editor cannot change the "locked" flag', lockedFlag.locked === false && lockedFlag.visibility === 'public', [
    lockedFlag.locked,
    lockedFlag.visibility,
  ])

  // editorUpload is public now (gallery of a public exhibition)
  check('the editor upload is public now', (await reload(editorUpload.id)).locked === false)
  await fails('an editor cannot replace or change their upload once it is public', () =>
    payload.update({ collection: 'media', id: editorUpload.id, data: { alt: 'changed' }, ...as(editor) }),
  )
  await fails('an editor cannot delete their upload once it is public', () =>
    payload.delete({ collection: 'media', id: editorUpload.id, ...as(editor) }),
  )

  const draftUpload: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'Draft' }, file: file(), ...as(editor) })
  const draftChanged: AnyDoc = await payload.update({
    collection: 'media',
    id: draftUpload.id,
    data: { alt: 'Draft 2' },
    ...as(editor),
  })

  check('an editor can still change their own locked upload', draftChanged.alt === 'Draft 2', draftChanged.alt)

  // "Locked with link": content only for a direct lookup
  const linkPhoto: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'L' }, file: file(), ...as(manager) })

  await payload.create({
    collection: 'exhibitions',
    data: { slug: 'link-one', title: 'Link', visibility: 'link', gallery: [{ file: linkPhoto.id }] },
    ...as(manager),
  })

  const anonymousList = await payload.find({ collection: 'exhibitions', overrideAccess: false, depth: 0 })
  const linkInList: AnyDoc = anonymousList.docs.find((doc: AnyDoc) => doc.slug === 'link-one')

  check('a link-only exhibition is still listed (poster and details)', Boolean(linkInList))
  check('lists do not contain the gallery of a link-only exhibition', !linkInList?.gallery?.length, linkInList?.gallery)

  const direct = await payload.find({
    collection: 'exhibitions',
    where: { slug: { equals: 'link-one' } },
    context: { tjSlug: 'link-one' },
    overrideAccess: false,
    depth: 0,
  })

  check('a direct lookup by ID gets the gallery', direct.docs[0]?.gallery?.length === 1, direct.docs[0]?.gallery)

  const { requestedSlug } = await import('../src/lib/visibility')

  check(
    'the REST lookup ?where[slug][equals]= counts as direct',
    requestedSlug({ searchParams: new URLSearchParams('where[slug][equals]=link-one') }) === 'link-one',
  )
  check('invalid IDs do not count as direct', requestedSlug({ context: { tjSlug: '../x' } }) === null)

  // Page size and the media API
  const unlimited = await payload.find({ collection: 'exhibitions', limit: 0, overrideAccess: false })
  const unpaginated = await payload.find({ collection: 'media', pagination: false, overrideAccess: false })

  check('visitors get at most 100 results (limit=0)', unlimited.limit === 100, unlimited.limit)
  check('visitors cannot turn pagination off', unpaginated.limit === 100, unpaginated.limit)

  const { Media } = await import('../src/collections/Media')
  const mediaRead = Media.access?.read as (args: AnyDoc) => Promise<unknown>

  check(
    'visitors cannot browse /api/media',
    (await mediaRead({ req: { user: null, pathname: '/api/media', payload } })) === false,
  )
  check(
    'the file route /api/media/file/… still works for visitors',
    (await mediaRead({ req: { user: null, pathname: '/api/media/file/x.webp', payload } })) !== false,
  )

  const protectOriginal = Media.upload && typeof Media.upload === 'object' ? Media.upload.handlers?.[0] : undefined
  const photoDoc = { filename: 'a.jpg', mimeType: 'image/jpeg', sizes: { thumb: { filename: 'a-600x400.webp' } } }
  const fileReq = (user: AnyDoc) => ({ user }) as AnyDoc
  const handle = async (user: AnyDoc, doc: AnyDoc, filename: string) =>
    protectOriginal?.(fileReq(user), { doc, params: { collection: 'media', filename } })

  check('visitors cannot load original photos (EXIF/GPS)', ((await handle(null, photoDoc, 'a.jpg')) as AnyDoc)?.status === 404)
  check('visitors can load the generated sizes', (await handle(null, photoDoc, 'a-600x400.webp')) === undefined)
  check('logged-in accounts can load originals', (await handle(editor, photoDoc, 'a.jpg')) === undefined)
  check(
    'videos stay available',
    (await handle(null, { filename: 'v.mp4', mimeType: 'video/mp4', sizes: {} }, 'v.mp4')) === undefined,
  )

  // Passwords
  const resetToken = await payload.forgotPassword({
    collection: 'users',
    data: { email: 'editor@test.local' },
    disableEmail: true,
  })

  await fails('a password reset also needs 12 characters', () =>
    payload.resetPassword({ collection: 'users', data: { token: String(resetToken), password: 'short' }, overrideAccess: true }),
  )

  const reset = await payload
    .resetPassword({
      collection: 'users',
      data: { token: String(resetToken), password: 'editor-password-new-1' },
      overrideAccess: true,
    })
    .then(() => true)
    .catch(() => false)

  check('a long enough password works with the same reset token', reset)

  // Template engine, mail links
  const { renderTemplate } = await import('../src/lib/render-template')
  const count = (html: string) => html.split('SECRET-VALUE').length - 1
  const withPlaceholder = renderTemplate('about.html', { title: '{{description}}', description: 'SECRET-VALUE' })
  const withoutPlaceholder = renderTemplate('about.html', { title: 'plain', description: 'SECRET-VALUE' })

  check(
    'placeholders typed into texts are not expanded',
    withPlaceholder.includes('{{description}}') && count(withPlaceholder) === count(withoutPlaceholder),
    [count(withPlaceholder), count(withoutPlaceholder)],
  )

  const { mailtoHref } = await import('../src/lib/site')

  check('mail links cannot add hidden recipients', !mailtoHref('a?bcc=x@evil.example').includes('?'), mailtoHref('a?bcc=x@evil.example'))

  // Login rate limit (src/proxy.ts)
  const { proxy } = await import('../src/proxy')
  const { NextRequest } = await import('next/server')
  const attempt = (address: string) =>
    proxy(
      new NextRequest('http://localhost:3000/api/users/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': `1.2.3.4, ${address}` },
      }),
    )
  const statuses: number[] = []

  for (let index = 0; index < 11; index += 1) {
    statuses.push(attempt('203.0.113.7').status)
  }

  check('10 login attempts per address are allowed', statuses.slice(0, 10).every((status) => status !== 429), statuses)
  check('the 11th attempt is blocked (429)', statuses[10] === 429, statuses[10])
  check('other addresses are not affected', attempt('203.0.113.8').status !== 429)

  // ---------- Shop (release 3.0): model and access ----------
  console.log('Shop – model')

  const shopImage: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'S' }, file: file(), ...as(manager) })
  const plainImage: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'N' }, file: file(), ...as(manager) })
  const shopExhibition: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'shop-one',
      title: 'Shop',
      visibility: 'public',
      release: 'scheduled',
      editors: [editor.id],
      gallery: [
        {
          file: shopImage.id,
          name: 'Sunset',
          prints: [
            { label: 'A3 print', width: 30, height: 40, material: 'Rag paper', pricing: 'fixed', price: 120, copies: 2 },
            { label: 'Large', pricing: 'request' },
            { label: 'Not yet', pricing: 'none' },
          ],
        },
        { file: plainImage.id, name: 'Just shown', prints: [{ label: 'Hidden', pricing: 'none' }] },
      ],
    },
    ...as(manager),
  })
  const shopRow = shopExhibition.gallery[0]
  const printId: string = shopRow.prints[0].id

  check('an exhibition manager can offer prints', shopRow.prints?.length === 3, shopRow.prints?.length)
  check('"No price" is a valid choice', shopRow.prints[2].pricing === 'none')

  const editedShop: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: shopExhibition.id,
    data: {
      gallery: [
        {
          id: shopRow.id,
          file: shopImage.id,
          name: 'Sunset 2',
          prints: [{ id: printId, label: 'A3 print', pricing: 'fixed', price: 1, copies: 999 }],
        },
        { id: shopExhibition.gallery[1].id, file: plainImage.id, name: 'Just shown' },
      ],
    },
    ...as(editor),
  })

  check(
    'an editor cannot change prints, prices or copies',
    editedShop.gallery[0].prints?.length === 3 &&
      editedShop.gallery[0].prints[0].price === 120 &&
      editedShop.gallery[0].prints[0].copies === 2,
    editedShop.gallery[0].prints,
  )
  check('an editor can still change the caption of a photo for sale', editedShop.gallery[0].name === 'Sunset 2')

  const visitorShop: AnyDoc = (
    await payload.find({ collection: 'exhibitions', where: { slug: { equals: 'shop-one' } }, overrideAccess: false })
  ).docs[0]

  check('visitors see the prints of a public exhibition', visitorShop?.gallery?.[0]?.prints?.[0]?.price === 120)
  check('visitors do not see the watermark choice of an exhibition', visitorShop?.watermark === undefined)

  const shopManager: AnyDoc = await payload.create({
    collection: 'users',
    data: { email: 'shop@test.local', password: 'shop-password-123', role: 'manager', sections: ['shop'] },
    ...as(admin),
  })
  const testOrder: AnyDoc = await payload.create({
    collection: 'orders',
    overrideAccess: true,
    data: {
      status: 'paid',
      orderNumber: 'TJ-2026-00001',
      customerEmail: 'buyer@test.local',
      items: [{ printId, quantity: 1, exhibitionSlug: 'shop-one', photoName: 'Sunset', unitPrice: 120, lineTotal: 120 }],
      subtotal: 120,
      shippingCost: 9.9,
      total: 129.9,
    },
  })

  await fails('visitors cannot read orders', () => payload.find({ collection: 'orders', overrideAccess: false }))
  await fails('an exhibition manager cannot read orders', () => payload.find({ collection: 'orders', ...as(manager) }))
  await fails('an editor cannot read price requests', () => payload.find({ collection: 'price-requests', ...as(editor) }))
  await fails('nobody creates orders through the API', () =>
    payload.create({ collection: 'orders', data: { status: 'paid', total: 1 }, ...as(admin) }),
  )
  await fails('nobody creates price requests through the API', () =>
    payload.create({ collection: 'price-requests', data: { email: 'x@test.local', status: 'open' }, ...as(admin) }),
  )

  const shopManagerOrders = await payload.find({ collection: 'orders', ...as(shopManager) })

  check('a shop manager sees the orders', shopManagerOrders.totalDocs === 1, shopManagerOrders.totalDocs)

  const statusChanged: AnyDoc = await payload.update({
    collection: 'orders',
    id: testOrder.id,
    data: { status: 'cancelled', total: 1, customerEmail: 'x@evil.example', orderNumber: 'TJ-0' },
    ...as(shopManager),
  })

  check(
    'a shop manager changes the status but not amounts, buyer or number',
    statusChanged.status === 'cancelled' &&
      statusChanged.total === 129.9 &&
      statusChanged.customerEmail === 'buyer@test.local' &&
      statusChanged.orderNumber === 'TJ-2026-00001',
    [statusChanged.status, statusChanged.total, statusChanged.customerEmail, statusChanged.orderNumber],
  )
  await fails('a shop manager cannot delete orders', () =>
    payload.delete({ collection: 'orders', id: testOrder.id, ...as(shopManager) }),
  )
  await fails('a shop manager cannot change exhibitions', () =>
    payload.update({ collection: 'exhibitions', id: shopExhibition.id, data: { title: 'x' }, ...as(shopManager) }),
  )

  const forcedForSale: AnyDoc = await payload.update({
    collection: 'media',
    id: plainImage.id,
    data: { forSale: true, watermarkKey: 'forged' },
    ...as(manager),
  })

  check('"forSale" and the watermark key cannot be set through the API', !forcedForSale.forSale && !forcedForSale.watermarkKey)

  // ---------- Shop: e-mails (captured instead of sent) ----------
  console.log('Shop – e-mail')

  type SentMail = { to: string; subject: string; text: string; html: string; replyTo?: string }
  const sentMails: SentMail[] = []
  const originalSendEmail = payload.sendEmail.bind(payload)

  payload.sendEmail = (async (message: SentMail) => {
    sentMails.push(message)
  }) as typeof payload.sendEmail

  await payload.updateGlobal({
    slug: 'site',
    data: { operatorName: 'Tom Test', operatorEmail: 'shop-owner@test.local', jurisdiction: 'at' },
    overrideAccess: true,
  })

  const shipped: AnyDoc = await payload.update({
    collection: 'orders',
    id: testOrder.id,
    data: { status: 'shipped', trackingNumber: 'TRACK123', trackingUrl: 'https://tracking.example/TRACK123' },
    ...as(shopManager),
  })
  const shippedMail = sentMails.find((mail) => mail.subject.includes('has been shipped'))

  check('"Shipped" stamps the shipping date', Boolean(shipped.shippedAt), shipped.shippedAt)
  check(
    '"Shipped" e-mails the buyer with the tracking details',
    shippedMail?.to === 'buyer@test.local' && shippedMail.text.includes('TRACK123'),
    shippedMail?.subject,
  )

  sentMails.length = 0
  await payload.update({ collection: 'orders', id: testOrder.id, data: { internalNote: 'packed' }, ...as(shopManager) })
  check('saving a shipped order again sends no second e-mail', sentMails.length === 0, sentMails.length)

  const { sendOrderConfirmation } = await import('../src/lib/shop/emails')

  await sendOrderConfirmation(payload, {
    id: 1,
    orderNumber: 'TJ-2026-00002',
    customerEmail: 'buyer@test.local',
    customerName: '<b>Buyer</b>',
    items: [{ photoName: '<script>alert(1)</script>', printLabel: 'A3', quantity: 1, unitPrice: 120, lineTotal: 120 }],
    subtotal: 120,
    shippingCost: 9.9,
    total: 129.9,
    vatNote: 'No VAT charged',
  })

  const confirmation = sentMails.find((mail) => mail.subject.includes('TJ-2026-00002'))

  check('the order confirmation escapes values from the order', Boolean(confirmation) && !confirmation!.html.includes('<script>'))
  check(
    'the order confirmation contains the withdrawal instructions and the terms',
    Boolean(confirmation?.text.includes('RIGHT OF WITHDRAWAL') && confirmation.text.includes('TERMS AND CONDITIONS')),
  )
  check('replies to the confirmation go to the shop', confirmation?.replyTo === 'shop-owner@test.local', confirmation?.replyTo)

  // ---------- Shop: offers, quote, stock, checkout, webhook ----------
  console.log('Shop – checkout')

  const shopNow: AnyDoc = await payload.findByID({ collection: 'exhibitions', id: shopExhibition.id, depth: 0, overrideAccess: true })

  shopNow.gallery[0].prints.push({ label: 'No amount', pricing: 'fixed' })
  await payload.update({ collection: 'exhibitions', id: shopExhibition.id, data: { gallery: shopNow.gallery }, ...as(manager) })

  const requestPrintId: string = shopRow.prints[1].id
  const nonePrintId: string = shopRow.prints[2].id
  const { findOffers, offerKey, parseCartItems } = await import('../src/lib/shop/catalog')
  const offers = await findOffers(payload, ['shop-one'])
  const photoId = String(shopImage.id)
  const offerA3 = offers.get(offerKey('shop-one', photoId, printId))

  check('visitors get the offer with the price of the exhibition', offerA3?.price === 120, offerA3)
  check('the print size is shown in cm', offerA3?.size === '30 × 40 cm', offerA3?.size)
  check('"No price" prints are not offered', !offers.has(offerKey('shop-one', photoId, nonePrintId)))
  check(
    'a fixed price without an amount is not offered',
    ![...offers.values()].some((offer) => offer.label === 'No amount'),
  )
  check('a photo with only "No price" prints offers nothing', ![...offers.values()].some((offer) => offer.mediaId === String(plainImage.id)))
  check('"price on request" is offered', offers.get(offerKey('shop-one', photoId, requestPrintId))?.pricing === 'request')
  check('locked exhibitions offer no prints', (await findOffers(payload, ['locked-one'])).size === 0)
  check('malformed cart items are rejected', parseCartItems([{ exhibition: 'shop-one', photo: '1', print: '<x>' }]) === null)
  check(
    'cart quantities are capped at 10',
    parseCartItems([{ exhibition: 'shop-one', photo: '1', print: 'abc', quantity: 999 }])?.[0].quantity === 10,
  )

  process.env.STRIPE_SECRET_KEY = 'sk_test_access_check'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_access_check'

  await payload.updateGlobal({
    slug: 'site',
    data: {
      shopEnabled: true,
      vatMode: 'smallBusiness',
      shippingZones: [{ name: 'Austria', price: 9.9, freeFrom: 500, countries: ['AT'], deliveryTime: '3–5 days' }],
    },
    overrideAccess: true,
  })

  const { getShopSettings } = await import('../src/lib/shop/settings')
  const { quoteCart } = await import('../src/lib/shop/checkout')
  const { countTaken } = await import('../src/lib/shop/stock')
  const shopSettings = await getShopSettings(payload)
  const cart = (print: string, quantity: number) => [{ exhibition: 'shop-one', photo: photoId, print, quantity }]

  check('the shop is open with Stripe keys and a shipping zone', shopSettings.enabled)
  check('the small business note follows the country', shopSettings.vatNote.includes('§ 6 Abs. 1 Z 27 UStG'), shopSettings.vatNote)

  // The shipped test order above holds 1 of the 2 copies
  const quote = await quoteCart(payload, shopSettings, cart(printId, 1), 'AT')

  check(
    'the quote uses the price of the exhibition and the shipping zone',
    quote.ok && quote.subtotal === 120 && quote.shipping === 9.9 && quote.total === 129.9,
    [quote.subtotal, quote.shipping, quote.total, quote.message],
  )
  check('shipped orders count as sold', quote.lines[0]?.left === 1, quote.lines[0]?.left)
  check(
    'more copies than left cannot be ordered',
    (await quoteCart(payload, shopSettings, cart(printId, 2), 'AT')).lines[0]?.problem === 'Only 1 copy left.',
  )
  check('countries without a shipping zone cannot order', (await quoteCart(payload, shopSettings, cart(printId, 1), 'DE')).total === null)
  check(
    '"price on request" cannot be ordered online',
    Boolean((await quoteCart(payload, shopSettings, cart(requestPrintId, 1), 'AT')).lines[0]?.problem),
  )
  check(
    '"No price" prints in a cart are dropped as missing',
    (await quoteCart(payload, shopSettings, cart(nonePrintId, 1), 'AT')).missing.length === 1,
  )

  const makeOrder = (status: string, minutes?: number) =>
    payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: {
        status: status as 'pending',
        expiresAt: minutes === undefined ? undefined : new Date(Date.now() + minutes * 60_000).toISOString(),
        items: [{ printId, quantity: 1, exhibitionSlug: 'shop-one', photoName: 'Sunset', unitPrice: 120, lineTotal: 120 }],
        subtotal: 120,
        shippingCost: 9.9,
        total: 129.9,
      },
    })

  await makeOrder('pending', -1)
  await makeOrder('cancelled')
  await makeOrder('refunded')
  check('expired, cancelled and refunded orders hold no copies', (await countTaken(payload, [printId])).get(printId) === 1)

  await makeOrder('pending', 30)
  check(
    'a running checkout holds the last copy',
    (await quoteCart(payload, shopSettings, cart(printId, 1), 'AT')).lines[0]?.problem === 'Sold out.',
  )

  // Stripe webhook: only signed events; paid → status, buyer, address, e-mails once
  sentMails.length = 0

  const { default: StripeSdk } = await import('stripe')
  const { POST: stripeWebhook } = await import('../src/app/shop/webhook/route')
  const webhookOrder: AnyDoc = await makeOrder('pending', 30)
  const sessionAddress = { line1: 'Teststraße 1', line2: null, postal_code: '1010', city: 'Wien', state: null, country: 'AT' }
  const eventBody = JSON.stringify({
    id: 'evt_access_check',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_access_check',
        object: 'checkout.session',
        client_reference_id: String(webhookOrder.id),
        metadata: { orderId: String(webhookOrder.id) },
        payment_status: 'paid',
        amount_total: 12990,
        payment_intent: 'pi_access_check',
        customer_details: { email: 'buyer@test.local', name: 'Buyer', phone: null, address: sessionAddress },
        collected_information: { shipping_details: { name: 'Buyer', address: sessionAddress } },
      },
    },
  })
  const signed = new StripeSdk('sk_test_access_check').webhooks.generateTestHeaderString({
    payload: eventBody,
    secret: 'whsec_access_check',
  })
  const webhookRequest = (signature: string) =>
    new Request('http://localhost:3000/shop/webhook', {
      method: 'POST',
      body: eventBody,
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    })

  check('webhooks without a valid signature are rejected', (await stripeWebhook(webhookRequest('t=1,v1=forged'))).status === 400)
  check('a signed Stripe webhook is accepted', (await stripeWebhook(webhookRequest(signed))).status === 200)

  const paidOrder: AnyDoc = await payload.findByID({ collection: 'orders', id: webhookOrder.id, overrideAccess: true })

  check(
    'the paid order gets status, number, buyer and shipping address',
    paidOrder.status === 'paid' &&
      /^TJ-\d{4}-\d{5}$/.test(paidOrder.orderNumber || '') &&
      paidOrder.customerEmail === 'buyer@test.local' &&
      paidOrder.shippingAddress?.city === 'Wien' &&
      paidOrder.confirmationSent === true,
    [paidOrder.status, paidOrder.orderNumber, paidOrder.customerEmail, paidOrder.shippingAddress?.city],
  )

  const mailsAfterFirst = sentMails.length

  check('the buyer and the shop get an e-mail', mailsAfterFirst === 2, sentMails.map((mail) => mail.to))
  check('a repeated webhook is accepted', (await stripeWebhook(webhookRequest(signed))).status === 200)
  check('a repeated webhook sends no e-mails again', sentMails.length === mailsAfterFirst, sentMails.length)

  payload.sendEmail = originalSendEmail

  // Shop routes: same origin only, rate limited
  const { POST: quoteRoute } = await import('../src/app/shop/quote/route')
  const quoteRequest = (origin?: string) =>
    quoteRoute(
      new Request('http://localhost:3000/shop/quote', {
        method: 'POST',
        body: JSON.stringify({ items: cart(printId, 1), country: 'AT' }),
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      }),
    )

  check('shop requests from other websites are refused', (await quoteRequest('https://evil.example')).status === 403)
  check('shop requests without an Origin are refused', (await quoteRequest()).status === 403)
  check('shop requests from the site itself are answered', (await quoteRequest('http://localhost:3000')).status === 200)

  const { GET: offersRoute } = await import('../src/app/shop/offers/route')
  const offersResponse = await offersRoute(new Request('http://localhost:3000/shop/offers?exhibition=shop-one'))
  const offersJson = (await offersResponse.json()) as AnyDoc

  check(
    'the offers route lists the offered prints with copies left',
    offersJson.enabled === true &&
      offersJson.offers.length === 2 &&
      offersJson.offers.find((offer: AnyDoc) => offer.print === printId)?.left === 0,
    offersJson,
  )
  check('the offers route is never cached', (offersResponse.headers.get('cache-control') || '').includes('no-store'))

  const shopPost = (path: string, address: string) =>
    proxy(new NextRequest('http://localhost:3000' + path, { method: 'POST', headers: { 'x-forwarded-for': address } })).status
  const requestStatuses = Array.from({ length: 6 }, () => shopPost('/shop/request', '203.0.113.20'))
  const checkoutStatuses = Array.from({ length: 11 }, () => shopPost('/shop/checkout', '203.0.113.21'))

  check('the 6th price request per address is blocked (429)', requestStatuses[5] === 429 && requestStatuses[4] !== 429, requestStatuses)
  check('the 11th checkout per address is blocked (429)', checkoutStatuses[10] === 429 && checkoutStatuses[9] !== 429, checkoutStatuses)
  check('the shop limits do not block the login', attempt('203.0.113.21').status !== 429)

  // ---------- Shop: watermark on photos for sale ----------
  console.log('Shop – watermark')

  const bigJpeg = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#357' } }).jpeg().toBuffer()
  const wmPhoto: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'For sale' },
    file: { data: bigJpeg, mimetype: 'image/jpeg', name: 'for-sale.jpg', size: bigJpeg.length },
    ...as(manager),
  })
  const wmExhibition: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'wm-one',
      title: 'Watermark',
      visibility: 'public',
      gallery: [{ file: wmPhoto.id, prints: [{ label: 'A2', pricing: 'fixed', price: 200 }] }],
    },
    ...as(manager),
  })
  const reloadMedia = (id: number | string): Promise<AnyDoc> => payload.findByID({ collection: 'media', id, overrideAccess: true })
  const visitorGallery = async (slug: string) =>
    ((await payload.find({ collection: 'exhibitions', where: { slug: { equals: slug } }, overrideAccess: false })).docs[0] as AnyDoc)
      ?.gallery

  const wmPhotoNow = await reloadMedia(wmPhoto.id)
  const firstKey: string = wmPhotoNow.watermarkKey

  check('a photo with a fixed price is for sale', wmPhotoNow.forSale === true && /^[a-f0-9]{12}$/.test(firstKey || ''), wmPhotoNow.forSale)
  check('"price on request" also makes a photo for sale', (await reloadMedia(shopImage.id)).forSale === true)
  check('a photo with only "No price" is not for sale', (await reloadMedia(plainImage.id)).forSale === false)

  const wmGallery = await visitorGallery('wm-one')
  const shopGallery = await visitorGallery('shop-one')

  check(
    'visitors get watermarked URLs for photos for sale',
    String(wmGallery?.[0]?.file?.url).includes('/media-wm/') &&
      String(wmGallery?.[0]?.file?.sizes?.medium?.url).endsWith(`/media-wm/${wmPhoto.id}-${firstKey}-medium.webp`),
    wmGallery?.[0]?.file?.sizes?.medium?.url,
  )
  check(
    'photos with "No price" keep their plain URLs',
    String(shopGallery?.[1]?.file?.url).includes('/api/media/file/'),
    shopGallery?.[1]?.file?.url,
  )

  const managerView: AnyDoc = await payload.findByID({ collection: 'media', id: wmPhoto.id, ...as(manager) })

  check('logged-in accounts see the plain files', String(managerView.url).includes('/api/media/file/'), managerView.url)

  const { Media: MediaCollection } = await import('../src/collections/Media')
  const fileHandler = (MediaCollection.upload as AnyDoc).handlers[0]
  const handlerRequest = async (user: AnyDoc) => {
    const req = await createLocalReq({ user: user || undefined }, payload)

    if (!user) {
      req.user = null
    }

    return req
  }
  const plainFile = wmPhotoNow.sizes.medium.filename
  const visitorPlain = await fileHandler(await handlerRequest(null), { doc: wmPhotoNow, params: { filename: plainFile } })
  const managerPlain = await fileHandler(await handlerRequest(manager), { doc: wmPhotoNow, params: { filename: plainFile } })

  check('visitors cannot load the plain files of a photo for sale', visitorPlain?.status === 404, visitorPlain?.status)
  check('managers can still load the plain files', managerPlain === undefined, managerPlain?.status)

  const { GET: watermarkRoute } = await import('../src/app/media-wm/[file]/route')
  const getWatermarked = (file: string) =>
    watermarkRoute(new Request('http://localhost:3000/media-wm/' + file), { params: Promise.resolve({ file }) })
  const wmResponse = await getWatermarked(`${wmPhoto.id}-${firstKey}-medium.webp`)
  const wmBytes = Buffer.from(await wmResponse.arrayBuffer())
  const wmMeta = wmResponse.status === 200 ? await sharp(wmBytes).metadata() : null

  check(
    'the watermarked copy is a WebP of the web size',
    wmResponse.headers.get('content-type') === 'image/webp' && wmMeta?.width === 1280,
    [wmResponse.status, wmMeta?.width],
  )

  const plainStats = await sharp(path.join(process.env.MEDIA_DIR as string, plainFile)).stats()
  const markedStats = wmMeta ? await sharp(wmBytes).stats() : null

  check(
    'the watermark changes the photo',
    Boolean(markedStats) && Math.abs(markedStats!.channels[0].max - plainStats.channels[0].max) > 20,
    [plainStats.channels[0].max, markedStats?.channels[0].max],
  )
  check('a watermarked copy has no EXIF data', !wmMeta?.exif)
  check('a wrong key gives 404', (await getWatermarked(`${wmPhoto.id}-000000000000-medium.webp`)).status === 404)
  check('a photo not for sale gives 404', (await getWatermarked(`${plainImage.id}-${firstKey}-medium.webp`)).status === 404)
  check('invalid names give 404', (await getWatermarked('../../tripnjungle.db')).status === 404)

  const logoPng = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.8 } } })
    .png()
    .toBuffer()
  const logo: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Logo' },
    file: { data: logoPng, mimetype: 'image/png', name: 'logo.png', size: logoPng.length },
    ...as(manager),
  })

  await payload.update({ collection: 'exhibitions', id: wmExhibition.id, data: { watermark: logo.id }, ...as(manager) })

  const overrideKey: string = (await reloadMedia(wmPhoto.id)).watermarkKey

  check('an exhibition watermark gives a new key', overrideKey !== firstKey && /^[a-f0-9]{12}$/.test(overrideKey), overrideKey)
  check('the watermark image itself stays locked', (await reloadMedia(logo.id)).locked === true)
  check(
    'the copy with the exhibition watermark is made',
    (await getWatermarked(`${wmPhoto.id}-${overrideKey}-thumb.webp`)).status === 200,
  )

  await payload.updateGlobal({ slug: 'site', data: { watermarkOpacity: 30, watermarkPosition: 'tiled' }, overrideAccess: true })

  const siteKey: string = (await reloadMedia(wmPhoto.id)).watermarkKey

  check('changing the watermark settings gives new keys', siteKey !== overrideKey, siteKey)
  check(
    'old watermarked files are removed when new ones are made',
    (await getWatermarked(`${wmPhoto.id}-${siteKey}-thumb.webp`)).status === 200 &&
      !fs.existsSync(path.join(process.env.MEDIA_DIR as string, 'watermarked', `${wmPhoto.id}-${overrideKey}-thumb.webp`)),
  )

  const wmRows: AnyDoc = (await payload.findByID({ collection: 'exhibitions', id: wmExhibition.id, depth: 0, overrideAccess: true })).gallery

  wmRows[0].prints[0].pricing = 'none'
  await payload.update({ collection: 'exhibitions', id: wmExhibition.id, data: { gallery: wmRows }, ...as(manager) })

  const backToPlain = await reloadMedia(wmPhoto.id)

  check('back to "No price" removes the watermark', backToPlain.forSale === false && !backToPlain.watermarkKey)
  check(
    'and visitors get the plain URLs again',
    String((await visitorGallery('wm-one'))?.[0]?.file?.url).includes('/api/media/file/'),
  )

  // ---------- Shop: legal texts, price requests, withdrawal ----------
  console.log('Shop – forms and legal texts')

  sentMails.length = 0
  payload.sendEmail = (async (message: SentMail) => {
    sentMails.push(message)
  }) as typeof payload.sendEmail

  const { legalTextToHtml, defaultWithdrawalText } = await import('../src/lib/shop/legal')
  const siteNow = await payload.findGlobal({ slug: 'site', overrideAccess: true })

  check('legal texts from the admin are escaped', !legalTextToHtml('## <script>x</script>\n\n<img onerror=x>').includes('<'.concat('script')))
  check(
    'the standard withdrawal text names the operator and the withdrawal function',
    defaultWithdrawalText(siteNow).includes('Tom Test') && defaultWithdrawalText(siteNow).includes('/withdrawal'),
  )

  const postJson = async (route: string, body: unknown) => {
    const module = route === 'request' ? await import('../src/app/shop/request/route') : await import('../src/app/shop/withdrawal/route')

    return module.POST(
      new Request(`http://localhost:3000/shop/${route}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      }),
    )
  }
  const priceRequest = (print: string, extra: Record<string, string> = {}) =>
    postJson('request', { exhibition: 'shop-one', photo: photoId, print, name: 'Ana', email: 'ana@test.local', message: 'How much?', ...extra })
  const countRequests = async () => (await payload.count({ collection: 'price-requests', overrideAccess: true })).totalDocs

  check('a price request for a print on request is accepted', (await priceRequest(requestPrintId)).status === 200)
  check('the price request is stored', (await countRequests()) === 1)

  const requestMail = sentMails.find((mail) => mail.subject.startsWith('Price request'))

  check(
    'the price request is e-mailed to the shop with Reply-To the visitor',
    requestMail?.to === 'shop-owner@test.local' && requestMail.replyTo === 'ana@test.local',
    [requestMail?.to, requestMail?.replyTo],
  )
  check('nothing is e-mailed to the visitor', !sentMails.some((mail) => mail.to === 'ana@test.local'))
  check('a price request for a fixed-price print is refused', (await priceRequest(printId)).status === 404)
  check('a price request for a "No price" print is refused', (await priceRequest(nonePrintId)).status === 404)
  check('a price request with an invalid e-mail is refused', (await priceRequest(requestPrintId, { email: 'nope' })).status === 400)
  check('bots filling the honeypot get "ok" but nothing is stored', (await priceRequest(requestPrintId, { website: 'spam' })).status === 200 && (await countRequests()) === 1)

  sentMails.length = 0

  const withdraw = (email: string) =>
    postJson('withdrawal', { name: 'Buyer', orderNumber: paidOrder.orderNumber.toLowerCase(), email, statement: 'I withdraw.' })

  check('a withdrawal with the wrong e-mail is refused', (await withdraw('someone@test.local')).status === 404)
  check('a refused withdrawal sends no e-mail', sentMails.length === 0, sentMails.length)
  check('a withdrawal with order number and e-mail is accepted', (await withdraw('BUYER@test.local')).status === 200)

  const withdrawn: AnyDoc = await payload.findByID({ collection: 'orders', id: paidOrder.id, overrideAccess: true })

  check('the order shows the withdrawal', Boolean(withdrawn.withdrawalReceivedAt) && withdrawn.withdrawalStatement.includes('I withdraw.'))
  check(
    'the acknowledgement goes to the address of the order, a note to the shop',
    sentMails.some((mail) => mail.to === 'buyer@test.local' && mail.subject.startsWith('Acknowledgement')) &&
      sentMails.some((mail) => mail.to === 'shop-owner@test.local'),
    sentMails.map((mail) => mail.to),
  )

  payload.sendEmail = originalSendEmail

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
