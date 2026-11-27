// "/imprint": legal notice from Admin → Site settings → Legal notice
import { renderStaticPage } from '@/lib/static-page'
import { SITE_NAME } from '@/lib/site-identity'
import { escapeHtml } from '@/lib/render-template'
import {
  htmlList,
  htmlMailLink,
  htmlOptional,
  htmlParagraphs,
  htmlRequired,
} from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

// When nothing is entered: what this website does, including the sale of prints
const DEFAULT_BUSINESS_PURPOSE =
  'Online gallery of photo and video exhibitions and sale of photo prints'

export async function GET() {
  return renderStaticPage({
    template: 'imprint.html',
    path: '/imprint',
    twitterCard: 'summary',
    title: `Legal notice – ${SITE_NAME}`,
    description: `Legal notice (Impressum) of ${SITE_NAME}: operator, address and contact.`,
    values: (settings) => {
      const austria = settings.jurisdiction === 'at'
      const name = htmlRequired(settings.operatorName, 'Name')
      const extra = htmlList(settings.legalExtra)

      return {
        lawReference: austria
          ? 'Information pursuant to § 5 ECG and § 25 MedienG'
          : 'Information pursuant to § 5 DDG',
        operatorName: name,
        operatorStreet: htmlRequired(settings.operatorStreet, 'Street and number'),
        operatorCity: htmlRequired(settings.operatorCity, 'Postal code and city'),
        operatorCountry: htmlRequired(settings.operatorCountry, 'Country'),
        operatorEmail: htmlMailLink(settings.operatorEmail, 'E-mail'),
        operatorPhone: htmlRequired(settings.operatorPhone, 'Phone'),
        businessPurposeBlock: austria
          ? `<h2>Business purpose (Unternehmensgegenstand)</h2><p>${htmlOptional(settings.businessPurpose?.trim() || DEFAULT_BUSINESS_PURPOSE)}</p>`
          : settings.businessPurpose?.trim()
            ? `<h2>Activity</h2><p>${htmlOptional(settings.businessPurpose)}</p>`
            : '',
        legalExtraBlock: extra ? `<h2>Further details</h2>${extra}` : '',
        responsibleBlock: austria
          ? ''
          : `<h2>Responsible for content pursuant to § 18 Abs. 2 MStV</h2><p>${
              settings.responsiblePerson?.trim()
                ? escapeHtml(settings.responsiblePerson.trim())
                : name
            }<br>Address as above.</p>`,
        imprintExtra: htmlParagraphs(settings.imprintExtra),
        // Digital Services Act: single point of contact (Art. 11, 12) and notices (Art. 16)
        contactPoint: htmlMailLink(settings.operatorEmail, 'E-mail'),
      }
    },
  })
}
