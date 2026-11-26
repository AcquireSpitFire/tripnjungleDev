// "/about": text and contact from Admin → Site settings → About
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { htmlMailLink, htmlParagraphs } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'about.html',
    path: '/about',
    title: `About – ${SITE_NAME}`,
    values: (settings) => ({
      aboutText:
        htmlParagraphs(settings.aboutText) ||
        '<p><mark>[About text – fill in under Admin → Site settings → About]</mark></p>',
      contactEmail: htmlMailLink(settings.contactEmail, 'Contact e-mail'),
    }),
  })
}
