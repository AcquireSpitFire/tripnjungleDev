// Access checks – Artists (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkArtists(t: Context): Promise<void> {
  const { payload, file, as, check, fails } = t
  const { acceptTerms, admin, editor, imageA, imageB, locked, manager, reload } = t.f

  console.log('Artists')

  const portrait: AnyDoc = await payload.create({ collection: 'media', data: { alt: 'Portrait', rightsConfirmed: true }, file: file(), ...as(manager) })
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

  await acceptTerms(artistUser)

  const artistImage: AnyDoc = await payload.create({
    collection: 'media',
    data: { alt: 'Ana 1', rightsConfirmed: true },
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

  Object.assign(t.f, { portrait, profile, artistUser, artistImage, own })
}
