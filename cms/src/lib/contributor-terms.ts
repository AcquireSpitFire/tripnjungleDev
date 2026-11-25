// Terms for contributor accounts (artists, editors, managers – everybody except admins).
//
// Before such an account may upload or change anything, it has to accept these terms on its own
// account page (src/components/ContributorTerms.tsx → POST /api/users/contributor-terms/accept).
// Stored on the account: date, version and a copy of the accepted text. Every change of the text
// (in Site settings → Contributor terms, or of the standard text below) gives a new version that
// has to be accepted again.
//
// The terms make the uploader responsible for their content and oblige them to indemnify the
// operator if they are at fault (also negligence). An indemnity regardless of fault would usually
// not hold in standard terms (§ 879 Abs. 3 ABGB, § 307 BGB). The operator still has to remove
// unlawful content once aware of it (DSA Art. 6) – no agreement changes that.
import crypto from 'crypto'
import { APIError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { getRole } from '../access/roles'
import type { Site, User } from '../payload-types'

const VERSION_KEY = 'tj:contributorTermsVersion'

export function defaultContributorTermsText(site: Pick<Site, 'operatorName' | 'jurisdiction'>): string {
  const operator = site.operatorName?.trim() || 'the operator of Tripnjungle (see the legal notice)'
  const austria = site.jurisdiction === 'at'
  const personRights = austria ? '§ 78 UrhG' : '§ 22 KUG'

  return `## 1. Scope

These terms apply to every account of the Tripnjungle administration area that is not an admin account (artists, editors, managers), and to everything uploaded, written or changed with it (“your content”). The operator is ${operator}.

## 2. Your content

You may only upload or add content for which you hold all necessary rights, or for which the rights holder has allowed this use. In particular you confirm that
— you are the author of the photos, videos and texts or have the author's permission,
— every recognisable person shown has agreed to the publication (right to one's own image, ${personRights}),
— the content does not infringe any rights of others (copyright, trademarks, personality rights, privacy) and is not unlawful or punishable (e.g. depictions of abuse, insults, incitement, glorification of violence).

Check every file before you upload it. If you are unsure, do not upload it and ask the operator.

## 3. Responsibility and indemnity

You are responsible for your content. If you upload or publish content that infringes the rights of others or is unlawful, and you are responsible for this – also through negligence, for example because you did not check a file before uploading it – you indemnify the operator against all claims of third parties arising from it, including reasonable costs of legal defence, and you compensate the operator for the resulting damage. Your criminal responsibility for your content remains with you.

Tell the operator immediately if you learn that content you uploaded is unlawful.

## 4. Rights of use

You grant the operator the free, non-exclusive right to show your content on the website, in previews and link previews, on printed QR labels and in announcements of the exhibitions, for as long as it is part of the website. Prints of your photos are only sold under a separate agreement with you.

## 5. Removal

The operator may remove or lock content and accounts at any time, in particular after a notice of a legal violation.

## 6. Your account

Keep your password secret and do not share your account. You are responsible for everything done with your account unless you are not at fault.

## 7. Changes

If these terms change, you have to accept the new version before you can upload or change content again.

## 8. Law

${austria ? 'Austrian' : 'German'} law applies. Mandatory consumer protection rules of the country of your habitual residence remain unaffected.`
}

export function contributorTermsText(site: Pick<Site, 'contributorTermsText' | 'operatorName' | 'jurisdiction'>): string {
  return site.contributorTermsText?.trim() || defaultContributorTermsText(site)
}

export function contributorTermsVersion(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 12)
}

// Everybody except admins has to accept
export function mustAcceptTerms(user: Parameters<typeof getRole>[0]): boolean {
  const role = getRole(user)

  return role !== null && role !== 'admin'
}

export async function currentContributorTerms(req: PayloadRequest): Promise<{ text: string; version: string }> {
  const cached = req.context[VERSION_KEY] as { text: string; version: string } | undefined

  if (cached) {
    return cached
  }

  const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })
  const text = contributorTermsText(site)
  const current = { text, version: contributorTermsVersion(text) }

  req.context[VERSION_KEY] = current

  return current
}

export async function hasAcceptedCurrentTerms(req: PayloadRequest): Promise<boolean> {
  if (!mustAcceptTerms(req.user)) {
    return true
  }

  // Read from the database: the account may have accepted after this session was loaded
  const account = (await req.payload
    .findByID({ collection: 'users', id: (req.user as User).id, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as User | null
  const { version } = await currentContributorTerms(req)

  return Boolean(account?.termsAcceptedVersion && account.termsAcceptedVersion === version)
}

// beforeChange hook for collections that accounts change (exhibitions, artists): without the
// accepted terms nothing is saved. Admins and server-side operations without an account pass.
export const requireAcceptedTerms: CollectionBeforeChangeHook = async ({ data, req }) => {
  await assertTermsAccepted(req)

  return data
}

// For the beforeChange hooks of everything an account can upload or change
export async function assertTermsAccepted(req: PayloadRequest): Promise<void> {
  if (!(await hasAcceptedCurrentTerms(req))) {
    throw new APIError(
      'Please accept the contributor terms first: click your account (top right) → “Contributor terms”.',
      403,
      null,
      true,
    )
  }
}
