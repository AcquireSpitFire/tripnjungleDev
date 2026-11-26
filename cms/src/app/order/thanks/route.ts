// "/order/thanks": Stripe sends the buyer here after the payment. The order is completed by the
// webhook (src/app/shop/webhook/route.ts); this page only says thank you and empties the cart in
// the browser (public/js/shop.js).
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'order-thanks.html',
    path: '/order/thanks',
    title: `Thank you – ${SITE_NAME}`,
    robots: 'noindex, nofollow',
  })
}
