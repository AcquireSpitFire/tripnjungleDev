// "/about": text and contact from Admin → Site settings → About
import { summarize } from '@/lib/render-template'
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { htmlMailLink, htmlParagraphs } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'about.html',
    path: '/about',
    title: `About – ${SITE_NAME}`,
    // Its own description (not the one of the home page): the start of the About text
    description: (settings) =>
      summarize(settings.aboutText) ||
      `About ${SITE_NAME}: who is behind it and how to get in touch.`,
    values: (settings) => ({
      aboutText:
        htmlParagraphs(settings.aboutText) ||
        '<p><mark>[About text – fill in under Admin → Site settings → About]</mark></p>',
      contactEmail: htmlMailLink(settings.contactEmail, 'Contact e-mail'),
    }),
  })
}
