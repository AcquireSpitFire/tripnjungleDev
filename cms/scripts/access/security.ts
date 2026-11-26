// Access checks – Security (run by scripts/check-access.ts)
import path from 'path'

import type { AnyDoc, Context } from './context'

export async function checkSecurity(t: Context): Promise<void> {
  const { payload, sharp, file, as, check, fails, nextNumber } = t
  const {
    artistImage,
    artistUser,
    editor,
    editorUpload,
    imageA,
    locked,
    manager,
    own,
    portrait,
    profile,
    reload,
  } = t.f

  console.log('Security')

  // Locked photos must not become public through artists/editors
  const managerPhoto: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'M', rightsConfirmed: true },
    file: file(),
    ...as(manager),
  })

  await payload.update({
    collection: 'exhibitions',
    id: own.id,
    data: { gallery: [{ file: artistImage.id }, { file: managerPhoto.id }] },
    ...as(manager),
  })
  await fails('an artist cannot make a locked photo of their exhibition public as portrait', () =>
    payload.update({
      collection: 'artists',
      id: profile.id,
      data: { portrait: managerPhoto.id },
      ...as(artistUser),
    }),
  )
  check('the photo stays locked', (await reload(managerPhoto.id)).locked === true)

  const ownPortrait: AnyDoc = await payload.update({
    collection: 'artists',
    id: profile.id,
    data: { portrait: artistImage.id },
    ...as(artistUser),
  })

  check(
    'an artist can use their own upload as portrait',
    String(ownPortrait.portrait?.id ?? ownPortrait.portrait) === String(artistImage.id),
  )

  const publicElsewhere: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Pub', rightsConfirmed: true },
    file: file(),
    ...as(manager),
  })
  const editorOpen: AnyDoc = await payload.create({
    collection: 'exhibitions',
    data: { slug: 'editor-open', title: 'Editor open', visibility: 'public', editors: [editor.id] },
    ...as(manager),
  })

  await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'other-open',
      title: 'Other open',
      visibility: 'public',
      gallery: [{ file: publicElsewhere.id }],
    },
    ...as(manager),
  })

  await fails('an editor cannot move a locked photo into a public exhibition', () =>
    payload.update({
      collection: 'exhibitions',
      id: editorOpen.id,
      data: { gallery: [{ file: imageA.id }] },
      ...as(editor),
    }),
  )
  await fails('an editor cannot make a locked photo public as poster', () =>
    payload.update({
      collection: 'exhibitions',
      id: locked.id,
      data: { posters: [imageA.id] },
      ...as(editor),
    }),
  )
  check('the locked photo stays locked', (await reload(imageA.id)).locked === true)

  const withPublic: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: editorOpen.id,
    data: { gallery: [{ file: publicElsewhere.id }, { file: editorUpload.id }] },
    ...as(editor),
  })

  check(
    'an editor can add public photos and their own uploads',
    withPublic.gallery?.length === 2,
    withPublic.gallery?.length,
  )

  const resaved: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: locked.id,
    data: { title: 'Saved again' },
    ...as(editor),
  })

  check(
    'saving an exhibition that already holds locked photos still works',
    resaved.title === 'Saved again',
  )

  const lockedFlag: AnyDoc = await payload.update({
    collection: 'exhibitions',
    id: editorOpen.id,
    data: { locked: true },
    ...as(editor),
  })

  check(
    'an editor cannot change the "locked" flag',
    lockedFlag.locked === false && lockedFlag.visibility === 'public',
    [lockedFlag.locked, lockedFlag.visibility],
  )

  // editorUpload is public now (gallery of a public exhibition)
  check('the editor upload is public now', (await reload(editorUpload.id)).locked === false)
  await fails('an editor cannot replace or change their upload once it is public', () =>
    payload.update({
      collection: 'media',
      id: editorUpload.id,
      data: { alt: 'changed', rightsConfirmed: true },
      ...as(editor),
    }),
  )
  await fails('an editor cannot delete their upload once it is public', () =>
    payload.delete({ collection: 'media', id: editorUpload.id, ...as(editor) }),
  )

  const draftUpload: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Draft', rightsConfirmed: true },
    file: file(),
    ...as(editor),
  })
  const draftChanged: AnyDoc = await payload.update({
    collection: 'media',
    id: draftUpload.id,
    data: { alt: 'Draft 2', rightsConfirmed: true },
    ...as(editor),
  })

  check(
    'an editor can still change their own locked upload',
    draftChanged.alt === 'Draft 2',
    draftChanged.alt,
  )

  // "Locked with link": content only for a direct lookup
  const linkPhoto: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'L', rightsConfirmed: true },
    file: file(),
    ...as(manager),
  })

  await payload.create({
    collection: 'exhibitions',
    data: {
      slug: 'link-one',
      title: 'Link',
      visibility: 'link',
      gallery: [{ file: linkPhoto.id }],
    },
    ...as(manager),
  })

  const anonymousList = await payload.find({
    collection: 'exhibitions',
    overrideAccess: false,
    depth: 0,
  })
  const linkInList: AnyDoc = anonymousList.docs.find((doc: AnyDoc) => doc.slug === 'link-one')

  check('a link-only exhibition is still listed (poster and details)', Boolean(linkInList))
  check(
    'lists do not contain the gallery of a link-only exhibition',
    !linkInList?.gallery?.length,
    linkInList?.gallery,
  )

  const direct = await payload.find({
    collection: 'exhibitions',
    where: { slug: { equals: 'link-one' } },
    context: { tjSlug: 'link-one' },
    overrideAccess: false,
    depth: 0,
  })

  check(
    'a direct lookup by ID gets the gallery',
    direct.docs[0]?.gallery?.length === 1,
    direct.docs[0]?.gallery,
  )

  const { requestedSlug } = await import('../../src/lib/visibility')

  check(
    'the REST lookup ?where[slug][equals]= counts as direct',
    requestedSlug({ searchParams: new URLSearchParams('where[slug][equals]=link-one') }) ===
      'link-one',
  )
  check(
    'invalid IDs do not count as direct',
    requestedSlug({ context: { tjSlug: '../x' } }) === null,
  )

  // Page size and the media API
  const unlimited = await payload.find({
    collection: 'exhibitions',
    limit: 0,
    overrideAccess: false,
  })
  const unpaginated = await payload.find({
    collection: 'media',
    pagination: false,
    overrideAccess: false,
  })

  check('visitors get at most 100 results (limit=0)', unlimited.limit === 100, unlimited.limit)
  check('visitors cannot turn pagination off', unpaginated.limit === 100, unpaginated.limit)

  const { Media } = await import('../../src/collections/Media')
  const mediaRead = Media.access?.read as (args: AnyDoc) => Promise<unknown>

  check(
    'visitors cannot browse /api/media',
    (await mediaRead({ req: { user: null, pathname: '/api/media', payload } })) === false,
  )
  check(
    'the file route /api/media/file/… still works for visitors',
    (await mediaRead({ req: { user: null, pathname: '/api/media/file/x.webp', payload } })) !==
      false,
  )

  const protectOriginal =
    Media.upload && typeof Media.upload === 'object' ? Media.upload.handlers?.[0] : undefined
  const photoDoc = {
    filename: 'a.jpg',
    mimeType: 'image/jpeg',
    sizes: { thumb: { filename: 'a-600x400.webp' } },
  }
  const fileReq = (user: AnyDoc) => ({ user }) as AnyDoc
  const handle = async (user: AnyDoc, doc: AnyDoc, filename: string) =>
    protectOriginal?.(fileReq(user), { doc, params: { collection: 'media', filename } })

  check(
    'visitors cannot load original photos (EXIF/GPS)',
    ((await handle(null, photoDoc, 'a.jpg')) as AnyDoc)?.status === 404,
  )
  check(
    'visitors can load the generated sizes',
    (await handle(null, photoDoc, 'a-600x400.webp')) === undefined,
  )
  check(
    'logged-in accounts can load originals',
    (await handle(editor, photoDoc, 'a.jpg')) === undefined,
  )
  check(
    'videos stay available',
    (await handle(null, { filename: 'v.mp4', mimeType: 'video/mp4', sizes: {} }, 'v.mp4')) ===
      undefined,
  )

  // Passwords
  const resetToken = await payload.forgotPassword({
    collection: 'users',
    data: { email: 'editor@test.local' },
    disableEmail: true,
  })

  await fails('a password reset also needs 12 characters', () =>
    payload.resetPassword({
      collection: 'users',
      data: { token: String(resetToken), password: 'short' },
      overrideAccess: true,
    }),
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
  const { renderTemplate } = await import('../../src/lib/render-template')
  const count = (html: string) => html.split('SECRET-VALUE').length - 1
  const withPlaceholder = renderTemplate('about.html', {
    title: '{{description}}',
    description: 'SECRET-VALUE',
  })
  const withoutPlaceholder = renderTemplate('about.html', {
    title: 'plain',
    description: 'SECRET-VALUE',
  })

  check(
    'placeholders typed into texts are not expanded',
    withPlaceholder.includes('{{description}}') &&
      count(withPlaceholder) === count(withoutPlaceholder),
    [count(withPlaceholder), count(withoutPlaceholder)],
  )

  const withPartialText = renderTemplate('about.html', {
    title: 'plain',
    aboutText: '<p>{{> footer}}</p>',
  })

  check(
    'shared pieces ({{> name}}) are put in, but not when typed into a text',
    withPartialText.includes('<p>{{> footer}}</p>') &&
      withPartialText.split('class="site_footer"').length === 2 &&
      !withoutPlaceholder.includes('{{>'),
  )

  const { mailtoHref } = await import('../../src/lib/site-settings')

  check(
    'mail links cannot add hidden recipients',
    !mailtoHref('a?bcc=x@evil.example').includes('?'),
    mailtoHref('a?bcc=x@evil.example'),
  )

  // Login rate limit (src/proxy.ts): per address + account, per address, per account – no lock
  const { proxy } = await import('../../src/proxy')
  const { NextRequest } = await import('next/server')
  const post = async (
    path: string,
    address: string,
    body?: string | FormData,
    type = 'application/json',
  ) =>
    (
      await proxy(
        new NextRequest('http://localhost:3000' + path, {
          method: 'POST',
          headers: {
            'x-forwarded-for': `1.2.3.4, ${address}`,
            ...(typeof body === 'string' ? { 'content-type': type } : {}),
          },
          body,
        }),
      )
    ).status
  const login = (address: string, email: string) =>
    post('/api/users/login', address, JSON.stringify({ email, password: 'wrong-password-1' }))
  const repeat = async (times: number, action: (index: number) => Promise<number>) => {
    const statuses: number[] = []

    for (let index = 0; index < times; index += 1) {
      statuses.push(await action(index))
    }

    return statuses
  }
  const blockedAt = (statuses: number[]) => statuses.findIndex((status) => status === 429)
  const attempt = (address: string) => login(address, 'someone@test.local')

  const pairStatuses = await repeat(6, () => login('203.0.113.7', 'admin@test.local'))

  check(
    '5 login attempts per address and account, the 6th is blocked (429)',
    blockedAt(pairStatuses) === 5,
    pairStatuses,
  )
  check(
    'the same address can still log in to another account',
    (await login('203.0.113.7', 'manager@test.local')) !== 429,
  )
  check(
    'another address can still log in to that account (nobody can lock out an account)',
    (await login('203.0.113.8', 'admin@test.local')) !== 429,
  )
  check(
    'upper case and spaces in the e-mail count as the same account',
    (await login('203.0.113.7', '  ADMIN@test.local ')) === 429,
  )

  const addressStatuses = await repeat(21, (index) =>
    login('203.0.113.11', `account-${index}@test.local`),
  )

  check(
    '20 login attempts per address, the 21st is blocked',
    blockedAt(addressStatuses) === 20,
    addressStatuses,
  )

  // Account limit: one address alone never reaches it; blocked tries do not count
  await repeat(25, () => login('203.0.113.12', 'target@test.local'))

  const spreadStatuses = await repeat(46, (index) =>
    login(`198.51.100.${index + 1}`, 'target@test.local'),
  )

  check(
    '50 attempts per account and hour from all addresses; blocked tries do not count',
    blockedAt(spreadStatuses) === 45,
    blockedAt(spreadStatuses),
  )

  const formStatuses = await repeat(3, () => login('203.0.113.13', 'form@test.local'))

  formStatuses.push(
    ...(await repeat(3, () => {
      const form = new FormData()

      form.set(
        '_payload',
        JSON.stringify({ email: 'Form@test.local', password: 'wrong-password-1' }),
      )
      return post('/api/users/login', '203.0.113.13', form)
    })),
  )
  check(
    'the admin login form (_payload) counts for the same account',
    blockedAt(formStatuses) === 5,
    formStatuses,
  )

  const forgotStatuses = await repeat(4, (index) =>
    post(
      '/api/users/forgot-password',
      `192.0.2.${index + 1}`,
      JSON.stringify({ email: 'admin@test.local' }),
    ),
  )

  check(
    '"Forgot password" at most 3 times per account and hour',
    blockedAt(forgotStatuses) === 3,
    forgotStatuses,
  )

  // Payload itself does not lock accounts any more
  for (let index = 0; index < 6; index += 1) {
    await payload
      .login({
        collection: 'users',
        data: { email: 'manager@test.local', password: 'wrong-password-1' },
      })
      .catch(() => null)
  }

  const afterWrong = await payload
    .login({
      collection: 'users',
      data: { email: 'manager@test.local', password: 'manager-password-1' },
    })
    .then((result) => Boolean(result.token))
    .catch((error: Error) => error.message)

  check('6 wrong passwords do not lock the account', afterWrong === true, afterWrong)

  // Encoded or otherwise changed paths reach the same handler and count the same
  const variants = [
    '/api/users/login',
    '/api/users/l%6Fgin',
    '/API/Users/Login/',
    '/api//users/login',
    '/api/users/./login',
    '/api/users/login',
  ]
  const variantStatuses = await repeat(6, (index) =>
    post(
      variants[index],
      '203.0.113.9',
      JSON.stringify({ email: 'variant@test.local', password: 'x' }),
    ),
  )

  check(
    'encoded, upper-case or doubled-slash login paths share one limit',
    blockedAt(variantStatuses) === 5,
    variantStatuses,
  )
  check(
    'an encoded checkout path is limited too',
    blockedAt(await repeat(11, () => post('/shop/check%6Fut', '203.0.113.10'))) === 10,
  )

  const { addressGroup } = await import('../../src/lib/client-address')

  check(
    'IPv6 addresses of one /64 network share a counter',
    addressGroup('2001:db8:1:2::5') === addressGroup('2001:0db8:0001:0002:ffff:0:0:1') &&
      addressGroup('2001:db8:1:2::5') !== addressGroup('2001:db8:1:3::5') &&
      addressGroup('[2001:db8:1:2::1]:443') === addressGroup('2001:db8:1:2::9'),
    [
      addressGroup('2001:db8:1:2::5'),
      addressGroup('2001:0db8:0001:0002:ffff:0:0:1'),
      addressGroup('[2001:db8:1:2::1]:443'),
    ],
  )
  check(
    'IPv4 addresses (also IPv4-mapped) stay single addresses',
    addressGroup('::ffff:203.0.113.5') === '203.0.113.5' &&
      addressGroup('203.0.113.5') === '203.0.113.5',
  )

  // Endpoints that are not needed are off
  check(
    'uploads from a URL are disabled (no server-side fetching)',
    payload.collections.media.config.upload.pasteURL === false,
  )
  check(
    'the Open Graph image endpoint (/api/og) is off',
    payload.config.admin.meta?.defaultOGImageType === 'off',
  )

  // The upload confirmation (with the uploader's e-mail) is not public
  const publicConfirmed: AnyDoc = await payload.findByID({
    collection: 'media',
    id: publicElsewhere.id,
    overrideAccess: false,
  })
  const managerConfirmed: AnyDoc = await payload.findByID({
    collection: 'media',
    id: publicElsewhere.id,
    ...as(manager),
  })

  check(
    'visitors do not see who confirmed the rights of a public photo',
    publicConfirmed.locked === false &&
      publicConfirmed.rightsConfirmedBy === undefined &&
      publicConfirmed.rightsConfirmedAt === undefined &&
      publicConfirmed.rightsConfirmed === undefined,
    [publicConfirmed.rightsConfirmedBy, publicConfirmed.rightsConfirmedAt],
  )
  check(
    'logged-in accounts still see the confirmation',
    String(managerConfirmed.rightsConfirmedBy).startsWith('manager@test.local'),
  )

  // Small images are saved without camera metadata; large originals stay untouched (prints)
  const exifJpeg = (width: number, height: number, orientation = 1) =>
    sharp({ create: { width, height, channels: 3, background: '#357' } })
      .jpeg()
      .withMetadata({ orientation, exif: { IFD0: { Copyright: 'tj-exif-probe' } } })
      .toBuffer()
  const uploadJpeg = async (data: Buffer) =>
    (await payload.create({
      collection: 'media',
      data: { alt: 'EXIF', rightsConfirmed: true },
      file: { data, mimetype: 'image/jpeg', name: `exif-${nextNumber()}.jpg`, size: data.length },
      ...as(manager),
    })) as AnyDoc
  const storedMetadata = (doc: AnyDoc) =>
    sharp(path.join(process.env.MEDIA_DIR as string, doc.filename)).metadata()
  const smallJpeg = await uploadJpeg(await exifJpeg(300, 200, 6))
  const smallMeta = await storedMetadata(smallJpeg)
  const largeJpeg = await uploadJpeg(await exifJpeg(1600, 1000))
  const largeMeta = await storedMetadata(largeJpeg)

  check(
    'a small image is stored without EXIF data, turned upright',
    !smallMeta.exif &&
      smallMeta.width === 200 &&
      smallMeta.height === 300 &&
      (smallMeta.orientation ?? 1) === 1,
    [Boolean(smallMeta.exif), smallMeta.width, smallMeta.height, smallMeta.orientation],
  )
  check(
    'a large original keeps its data (only logged-in accounts get it)',
    Boolean(largeMeta.exif) && largeMeta.width === 1600,
  )

  Object.assign(t.f, { Media, post, repeat, attempt })
}
