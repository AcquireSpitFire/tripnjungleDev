// "/order/thanks?session_id=…": Stripe sends the buyer here after the payment. The order is
// completed by the webhook (src/app/shop/webhook/route.ts); this page says thank you, shows the
// order number (nothing else of the order) and empties the cart in the browser
// (public/js/cart-store.js). Never cached: the number belongs to this one buyer.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { escapeHtml } from '@/lib/render-template'
import { SITE_NAME } from '@/lib/site-identity'
import { renderStaticPage } from '@/lib/static-page'

export const dynamic = 'force-dynamic'

async function orderNumberFor(sessionId: string | null): Promise<string | null> {
  if (!sessionId || !/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
    return null
  }

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'orders',
    where: { stripeSessionId: { equals: sessionId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    select: { orderNumber: true },
  })

  return docs[0]?.orderNumber || null
}

export async function GET(request: Request) {
  const orderNumber = await orderNumberFor(new URL(request.url).searchParams.get('session_id'))

  return renderStaticPage({
    template: 'order-thanks.html',
    path: '/order/thanks',
    twitterCard: 'summary',
    title: `Thank you – ${SITE_NAME}`,
    robots: 'noindex, nofollow',
    cache: 'private, no-store',
    values: () => ({
      orderNumberHtml: orderNumber
        ? `<p><strong>Your order number: ${escapeHtml(orderNumber)}</strong> – please give it in every message about this order.</p>`
        : '',
    }),
  })
}
