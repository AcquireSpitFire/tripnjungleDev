// "/terms": terms and conditions of the shop (Admin → Site settings → Shop, src/lib/shop/legal.ts)
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { legalTextToHtml, termsText } from '@/lib/shop/legal'
import { formatDate } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'terms.html',
    path: '/terms',
    title: `Terms and conditions – ${SITE_NAME}`,
    description: `Terms and conditions (AGB) for prints ordered at ${SITE_NAME}.`,
    values: (site) => ({
      updated: formatDate(site.updatedAt),
      termsHtml: legalTextToHtml(termsText(site)),
    }),
  })
}
