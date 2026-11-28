// "/terms": terms and conditions of the shop (Admin → Site settings → Shop, src/lib/shop/legal.ts)
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { legalTextToHtml, termsText } from '@/lib/shop/legal'
import { formatLongDate } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'terms.html',
    path: '/terms',
    twitterCard: 'summary',
    title: `Terms and conditions – ${SITE_NAME}`,
    description: `Terms and conditions (AGB) for prints ordered at ${SITE_NAME}.`,
    values: (site) => ({
      updated: formatLongDate(site.updatedAt),
      termsHtml: legalTextToHtml(termsText(site)),
    }),
  })
}
