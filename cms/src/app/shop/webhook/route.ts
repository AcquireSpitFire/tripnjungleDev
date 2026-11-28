// POST /shop/webhook: events from Stripe (Dashboard → Developers → Webhooks → endpoint
// https://<domain>/shop/webhook, events checkout.session.*). Only events with a valid signature
// (STRIPE_WEBHOOK_SECRET) are processed, see src/lib/shop/webhook.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getStripe } from '@/lib/shop/settings'
import { handleStripeEvent } from '@/lib/shop/webhook'

export const dynamic = 'force-dynamic'

const MAX_EVENT_BYTES = 512 * 1024

function text(message: string, status: number): Response {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')

  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return text('Shop not configured', 503)
  }

  if (!signature) {
    return text('Missing signature', 400)
  }

  // The signature covers the raw body: read it as text, never parse it first
  const body = await request.text()

  if (body.length > MAX_EVENT_BYTES) {
    return text('Too large', 413)
  }

  let event

  try {
    event = await getStripe().webhooks.constructEventAsync(body, signature, secret)
  } catch {
    return text('Invalid signature', 400)
  }

  const payload = await getPayload({ config: configPromise })

  try {
    await handleStripeEvent(payload, event)
  } catch (error) {
    // 500 → Stripe repeats the event later
    payload.logger.error({ err: error, msg: `Stripe webhook ${event.type} failed` })
    return text('Error', 500)
  }

  return text('ok', 200)
}
