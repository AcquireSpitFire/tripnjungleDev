// Endpoints of the contributor terms (src/lib/contributor-terms.ts), used by
// src/components/ContributorTerms.tsx and ContributorTermsNotice.tsx:
//
//   GET  /api/users/contributor-terms          the current terms and whether this account accepted them
//   POST /api/users/contributor-terms/accept   { version } – the logged-in account accepts the terms it
//                                              was shown. Only ever for itself: nobody can accept for
//                                              another account.
import { addDataAndFileToRequest, type Endpoint } from 'payload'

import { getRole, getUserId } from '../access/roles'
import { currentContributorTerms, hasAcceptedCurrentTerms, mustAcceptTerms } from '../lib/contributor-terms'
import { errorJson, json } from '../lib/http'

export const contributorTermsEndpoint: Endpoint = {
  path: '/contributor-terms',
  method: 'get',
  handler: async (req) => {
    if (!getRole(req.user)) {
      return errorJson('Please log in.', 401)
    }

    const { text, version } = await currentContributorTerms(req)
    const account = req.user as unknown as { termsAcceptedAt?: string | null }

    return json({
      required: mustAcceptTerms(req.user),
      accepted: await hasAcceptedCurrentTerms(req),
      acceptedAt: account.termsAcceptedAt ?? null,
      text,
      version,
    })
  },
}

export const acceptContributorTermsEndpoint: Endpoint = {
  path: '/contributor-terms/accept',
  method: 'post',
  handler: async (req) => {
    if (!mustAcceptTerms(req.user)) {
      return errorJson('Not needed for this account.', 400)
    }

    await addDataAndFileToRequest(req)

    const { text, version } = await currentContributorTerms(req)

    // The text may have changed while the page was open: then the new one has to be read first
    if ((req.data as { version?: unknown } | undefined)?.version !== version) {
      return errorJson('The terms have changed in the meantime. Please reload the page and read them again.', 409)
    }

    const acceptedAt = new Date().toISOString()

    await req.payload.update({
      collection: 'users',
      id: getUserId(req.user) as number,
      data: { termsAcceptedAt: acceptedAt, termsAcceptedVersion: version, termsAcceptedText: text },
      overrideAccess: true,
      req,
    })

    return json({ accepted: true, acceptedAt })
  },
}
