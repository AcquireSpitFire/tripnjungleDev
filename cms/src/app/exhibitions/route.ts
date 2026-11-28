// "/exhibitions" – list of all public exhibitions
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'

export const dynamic = 'force-dynamic'

export async function GET() {
  return renderStaticPage({
    template: 'exhibitions.html',
    path: '/exhibitions',
    title: `Exhibitions – ${SITE_NAME}`,
    description: `All photo and video exhibitions on ${SITE_NAME}: trips, nights out and everything in between.`,
  })
}
