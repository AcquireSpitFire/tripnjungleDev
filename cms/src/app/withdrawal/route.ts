// "/withdrawal": instructions on withdrawal, model form and the withdrawal function
// (Admin → Site settings → Shop, src/lib/shop/legal.ts).
//
//   GET   the page; public/js/withdrawal-form.js sends the form as JSON (POST /shop/withdrawal)
//   POST  the same form without JavaScript (an ordinary form post): the page again, with the
//         result above the form (src/lib/shop/withdrawal.ts). Only from our own pages (Origin),
//         rate limited in src/proxy.ts.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isSameOrigin } from '@/lib/http'
import { escapeHtml } from '@/lib/render-template'
import { legalTextToHtml, withdrawalText } from '@/lib/shop/legal'
import { recordWithdrawal } from '@/lib/shop/withdrawal'
import { SITE_NAME } from '@/lib/site-identity'
import { formatLongDate } from '@/lib/site-settings'
import { renderStaticPage } from '@/lib/static-page'

export const dynamic = 'force-dynamic'

function withdrawalPage(resultHtml = '', cache?: string) {
  return renderStaticPage({
    template: 'withdrawal.html',
    path: '/withdrawal',
    twitterCard: 'summary',
    title: `Right of withdrawal – ${SITE_NAME}`,
    description: `Instructions on withdrawal, model withdrawal form and withdrawal function for orders at ${SITE_NAME}.`,
    ...(cache ? { cache } : {}),
    values: (site) => ({
      updated: formatLongDate(site.updatedAt),
      withdrawalHtml: legalTextToHtml(withdrawalText(site)),
      withdrawalResult: resultHtml,
    }),
  })
}

export async function GET() {
  return withdrawalPage()
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return new Response('Forbidden', { status: 403 })
  }

  let input: Record<string, unknown> = {}

  try {
    input = Object.fromEntries((await request.formData()).entries())
  } catch {
    // not a form: the check below asks for the fields
  }

  const result = await recordWithdrawal(await getPayload({ config: configPromise }), input)
  const html = result.ok
    ? `<p class="shop_form_done" role="status">Your withdrawal from order ${escapeHtml(
        String(input.orderNumber || '')
          .trim()
          .toUpperCase(),
      )} was received on ${escapeHtml(new Date(result.received).toLocaleString('en-GB', { timeZone: 'Europe/Vienna' }))}. ${escapeHtml(
        result.note ||
          'You will receive an acknowledgement by e-mail. Please send the goods back within 14 days.',
      )}</p>`
    : `<p class="form_message" role="alert">${escapeHtml(result.error)}</p>`

  // The answer belongs to this one visitor: never cached
  return withdrawalPage(html, 'private, no-store')
}
