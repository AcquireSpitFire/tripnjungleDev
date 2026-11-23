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
