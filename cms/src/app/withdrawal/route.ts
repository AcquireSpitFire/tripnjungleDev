// "/withdrawal": instructions on withdrawal, model form and the withdrawal function
// (Admin → Site settings → Shop, src/lib/shop/legal.ts; the form → src/app/shop/withdrawal/route.ts)
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { legalTextToHtml, withdrawalText } from '@/lib/shop/legal'
import { formatLongDate } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'withdrawal.html',
    path: '/withdrawal',
    title: `Right of withdrawal – ${SITE_NAME}`,
    description: `Instructions on withdrawal, model withdrawal form and withdrawal function for orders at ${SITE_NAME}.`,
    values: (site) => ({
      updated: formatLongDate(site.updatedAt),
      withdrawalHtml: legalTextToHtml(withdrawalText(site)),
    }),
  })
}
