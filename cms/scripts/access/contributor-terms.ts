// Access checks – Contributor terms (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkContributorTerms(t: Context): Promise<void> {
  const { payload, file, as, check, fails } = t
  const { admin, editor, manager, managerWithoutSection } = t.f

  // ---------- Contributor terms ----------
  console.log('Contributor terms')

  const { createLocalReq } = await import('payload')
  const { Users: UsersCollection } = await import('../../src/collections/Users')
  const termsEndpoint = (path: string) =>
    (UsersCollection.endpoints as AnyDoc[]).find((endpoint) => endpoint.path === path)
  const getTerms = async (user: AnyDoc) =>
    (await (await termsEndpoint('/contributor-terms').handler(await createLocalReq({ user }, payload))).json()) as AnyDoc
  const acceptTerms = async (user: AnyDoc, version?: string) => {
    const current = version ?? (await getTerms(user)).version
    const req = await createLocalReq({ user, req: { data: { version: current } } as AnyDoc }, payload)

    return termsEndpoint('/contributor-terms/accept').handler(req) as Promise<Response>
  }
  const uploadAs = (user: AnyDoc) => payload.create({ collection: 'media', data: { alt: 'T', rightsConfirmed: true }, file: file(), ...as(user) })

  const editorTerms = await getTerms(editor)

  check('editors have to accept the contributor terms', editorTerms.required === true && editorTerms.accepted === false)
  check('the standard terms make uploaders responsible', String(editorTerms.text).includes('indemnify the operator'))
  check('admins do not have to accept them', (await getTerms(admin)).required === false)

  let termsError = ''

  try {
    await uploadAs(editor)
  } catch (error) {
    termsError = error instanceof Error ? error.message : String(error)
  }

  check('without accepting, an editor cannot upload', termsError.includes('contributor terms'), termsError)
  await fails('without accepting, a manager cannot create exhibitions', () =>
    payload.create({ collection: 'exhibitions', data: { slug: 'terms-x', title: 'X' }, ...as(manager) }),
  )
  check('admins upload without accepting', Boolean(await uploadAs(admin)))
  check('an outdated version cannot be accepted', (await acceptTerms(editor, '000000000000')).status === 409)
  check('admins cannot accept (for themselves or anybody else)', (await acceptTerms(admin)).status === 400)

  const forgedTerms: AnyDoc = await payload.update({
    collection: 'users',
    id: editor.id,
    data: { termsAcceptedVersion: editorTerms.version, termsAcceptedAt: new Date().toISOString() },
    ...as(editor),
  })

  check('the acceptance cannot be set through the API', !forgedTerms.termsAcceptedVersion, forgedTerms.termsAcceptedVersion)
  check('an editor accepts on their own account', (await acceptTerms(editor)).status === 200)

  const editorAccepted: AnyDoc = await payload.findByID({ collection: 'users', id: editor.id, overrideAccess: true })

  check(
    'date, version and a copy of the text are stored',
    Boolean(editorAccepted.termsAcceptedAt) &&
      editorAccepted.termsAcceptedVersion === editorTerms.version &&
      editorAccepted.termsAcceptedText === editorTerms.text,
  )
  check('after accepting, the editor can upload', Boolean(await uploadAs(editor)))

  // Confirmation of the rights for every upload
  let rightsError = ''

  try {
    await payload.create({ collection: 'media', data: { alt: 'No confirmation' }, file: file(), ...as(editor) })
  } catch (error) {
    rightsError = JSON.stringify((error as AnyDoc)?.data ?? (error as Error).message)
  }

  check('an upload without the rights confirmation is refused', rightsError.includes('rightsConfirmed'), rightsError)
  check(
    'admins upload without the rights confirmation',
    Boolean(await payload.create({ collection: 'media', data: { alt: 'Admin' }, file: file(), ...as(admin) })),
  )

  const confirmedUpload: AnyDoc = await uploadAs(editor)

  check(
    'the confirmation is stored with date and account',
    confirmedUpload.rightsConfirmed === true &&
      Boolean(confirmedUpload.rightsConfirmedAt) &&
      String(confirmedUpload.rightsConfirmedBy).startsWith('editor@test.local (account '),
    [confirmedUpload.rightsConfirmedAt, confirmedUpload.rightsConfirmedBy],
  )

  const unconfirmed: AnyDoc = await payload.update({
    collection: 'media',
    id: confirmedUpload.id,
    data: { rightsConfirmed: false, rightsConfirmedBy: 'someone else' },
    ...as(editor),
  })

  check(
    'the confirmation cannot be changed afterwards',
    unconfirmed.rightsConfirmed === true && unconfirmed.rightsConfirmedBy === confirmedUpload.rightsConfirmedBy,
    [unconfirmed.rightsConfirmed, unconfirmed.rightsConfirmedBy],
  )

  // The other test accounts accept now, so the checks below test what they always did
  for (const user of [manager, managerWithoutSection]) {
    await acceptTerms(user)
  }

  Object.assign(t.f, { createLocalReq, getTerms, acceptTerms, uploadAs })
}
