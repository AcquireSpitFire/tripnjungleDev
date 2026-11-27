// Checks the permission matrix (src/access/roles.ts) and the rules of the shop, the watermark and
// the legal texts against a TEMPORARY database and media folder – the real tripnjungle.db is never
// touched:
//   cd cms && npm run test:access
// Every check prints ✓ or ✗; the exit code is 1 if any check fails.
//
// One file per area in scripts/access/. They run in this order and build on each other: accounts,
// exhibitions and prints made by an earlier area are passed on in t.f (see scripts/access/context.ts).
import { createContext, finish } from './access/context'
import { checkAccounts } from './access/accounts'
import { checkContributorTerms } from './access/contributor-terms'
import { checkExhibitions } from './access/exhibitions'
import { checkMediaLock } from './access/media-lock'
import { checkArtists } from './access/artists'
import { checkEditors } from './access/editors'
import { checkQrCodes } from './access/qr-codes'
import { checkSecurity } from './access/security'
import { checkShopModel } from './access/shop-model'
import { checkShopEmail } from './access/shop-email'
import { checkShopCheckout } from './access/shop-checkout'
import { checkShopWatermark } from './access/shop-watermark'
import { checkSeo } from './access/seo'
import { checkLegal } from './access/legal'
import { checkShopForms } from './access/shop-forms'
import { checkShopStatus } from './access/shop-status'

const AREAS = [
  checkAccounts,
  checkContributorTerms,
  checkExhibitions,
  checkMediaLock,
  checkArtists,
  checkEditors,
  checkQrCodes,
  checkSecurity,
  checkShopModel,
  checkShopEmail,
  checkShopCheckout,
  checkShopWatermark,
  checkShopForms,
  checkShopStatus,
  checkSeo,
  checkLegal,
]

async function run() {
  const t = await createContext()

  for (const area of AREAS) {
    await area(t)
  }
}

run().then(() => finish(), finish)
