// "/cart": the cart (public/js/cart.js). The page itself contains no personal data – the items
// live in the visitor's browser – so it is cached like the other pages.
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { shippingCountries, toShopSettings } from '@/lib/shop/settings'
import { paragraphs } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'cart.html',
    path: '/cart',
    title: `Cart – ${SITE_NAME}`,
    description: `Your cart at ${SITE_NAME}: prints of the photos in the exhibitions.`,
    robots: 'noindex, follow',
    values: (site) => {
      const settings = toShopSettings(site)

      return {
        shopOpen: settings.enabled ? 'true' : 'false',
        countriesJson: JSON.stringify(shippingCountries(settings)),
        vatNote: settings.vatNote,
        sellerName: site.operatorName?.trim() || SITE_NAME,
        shopNote: paragraphs(settings.shopNote),
      }
    },
  })
}
