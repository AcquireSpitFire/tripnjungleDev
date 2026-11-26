import type { GlobalAfterChangeHook, GlobalConfig } from 'payload'

import { isAdmin } from '../access/roles'
import { shopStatusEndpoint } from '../endpoints/shop-status'
import { syncMediaLocks } from '../lib/media-lock'
import { toId } from '../lib/visibility'
import { aboutTab } from './site/about'
import { contributorTermsTab } from './site/contributor-terms'
import { legalNoticeTab } from './site/legal-notice'
import { privacyTab } from './site/privacy'
import { qrTab } from './site/qr'
import { shopTab } from './site/shop'

// Site-wide settings: About text, contact, legal notice, privacy policy, shop, contributor terms,
// QR labels – one tab each in src/globals/site/. Read by the route handlers (/about, /imprint,
// /privacy, …) and inserted into the templates. Only admins may read and change them via the API
// and the admin panel; the pages themselves load them on the server.

// A new watermark (image, opacity, size, position): every photo for sale gets a new key and so
// new watermarked files (src/lib/watermark.ts)
const resyncWatermarkedMedia: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const watermarkOf = (site: typeof doc) =>
    JSON.stringify([toId(site?.watermarkImage), site?.watermarkOpacity, site?.watermarkSize, site?.watermarkPosition])

  if (watermarkOf(doc) !== watermarkOf(previousDoc)) {
    const { docs } = await req.payload.find({
      collection: 'media',
      where: { forSale: { equals: true } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: {},
      req,
    })

    await syncMediaLocks(
      req,
      docs.map((medium) => medium.id),
    )
  }

  return doc
}

export const Site: GlobalConfig = {
  slug: 'site',
  label: 'Site settings',
  access: {
    read: ({ req }) => isAdmin(req.user),
    update: ({ req }) => isAdmin(req.user),
  },
  endpoints: [shopStatusEndpoint],
  hooks: {
    afterChange: [resyncWatermarkedMedia],
  },
  admin: {
    hidden: ({ user }) => !isAdmin(user),
    description:
      'Texts for About, the legal notice (Impressum), the privacy policy, the shop and the QR labels. Fill in everything before going live.',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [aboutTab, legalNoticeTab, privacyTab, shopTab, contributorTermsTab, qrTab],
    },
  ],
}
