import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/roles'
import { syncMediaLocks } from '../lib/media-lock'
import { COUNTRY_OPTIONS } from '../lib/shop/countries'
import { shopStatus } from '../lib/shop/settings'

// Site-wide settings: About text, contact, legal notice, privacy policy, shop.
// Read by the route handlers (/about, /imprint, /privacy) and inserted into
// the templates. Only admins may read and change them via the API and the
// admin panel; the pages themselves load them on the server.
export const Site: GlobalConfig = {
  slug: 'site',
  label: 'Site settings',
  access: {
    read: ({ req }) => isAdmin(req.user),
    update: ({ req }) => isAdmin(req.user),
  },
  endpoints: [
    {
      // GET /api/globals/site/shop-status: what the shop still needs (src/components/ShopStatus.tsx).
      // Admins only; tells which server variables are set, never their values.
      path: '/shop-status',
      method: 'get',
      handler: async (req) => {
        if (!isAdmin(req.user)) {
          return Response.json({ error: 'Not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
        }

        const site = await req.payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true, req })

        return Response.json(shopStatus(site), { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const watermarkOf = (site: typeof doc) =>
          JSON.stringify([
            site?.watermarkImage && typeof site.watermarkImage === 'object' ? site.watermarkImage.id : site?.watermarkImage,
            site?.watermarkOpacity,
            site?.watermarkSize,
            site?.watermarkPosition,
          ])

        // A new watermark: every photo for sale gets a new key (and so new watermarked files)
        if (watermarkOf(doc) !== watermarkOf(previousDoc)) {
          const { docs } = await req.payload.find({
            collection: 'media',
            where: { forSale: { equals: true } },
            depth: 0,
            pagination: false,
            overrideAccess: true,
            select: {},
            req,
          })

          await syncMediaLocks(
            req,
            docs.map((medium) => medium.id),
          )
        }

        return doc
      },
    ],
  },
  admin: {
    hidden: ({ user }) => !isAdmin(user),
    description:
      'Texts for About, the legal notice (Impressum), the privacy policy, the shop and the QR labels. Fill in everything before going live.',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'About',
          fields: [
            {
              name: 'siteDescription',
              type: 'text',
              label: 'Site description (search engines, max. 160 characters)',
              maxLength: 160,
            },
            {
              name: 'aboutText',
              type: 'textarea',
              label: 'About text',
              admin: { description: 'Blank line = new paragraph.' },
            },
            {
              name: 'contactEmail',
              type: 'email',
              label: 'Contact e-mail shown on About',
            },
          ],
        },
        {
          label: 'Legal notice',
          description:
            'Impressum: who runs this website. Required by law as soon as the site is not purely private.',
          fields: [
            {
              name: 'jurisdiction',
              type: 'select',
              label: 'Country of the operator',
              defaultValue: 'de',
              required: true,
              options: [
                { label: 'Germany (§ 5 DDG, § 18 MStV)', value: 'de' },
                { label: 'Austria (§ 5 ECG, § 25 MedienG)', value: 'at' },
              ],
            },
            { name: 'operatorName', type: 'text', label: 'Name (person or company)' },
            { name: 'operatorStreet', type: 'text', label: 'Street and number (no P.O. box)' },
            { name: 'operatorCity', type: 'text', label: 'Postal code and city' },
            { name: 'operatorCountry', type: 'text', label: 'Country' },
            { name: 'operatorEmail', type: 'email', label: 'E-mail' },
            {
              name: 'operatorPhone',
              type: 'text',
              label: 'Phone',
              admin: { description: 'A second fast contact channel besides e-mail is expected by law.' },
            },
            {
              name: 'businessPurpose',
              type: 'text',
              label: 'Business purpose (Austria: Unternehmensgegenstand)',
              defaultValue: 'Photo and video exhibitions',
            },
            {
              name: 'legalExtra',
              type: 'textarea',
              label: 'Further details',
              admin: {
                description:
                  'Only if applicable: legal form, commercial register and number, VAT ID, supervisory authority, chamber. One item per line.',
              },
            },
            {
              name: 'responsiblePerson',
              type: 'text',
              label: 'Responsible for content (Germany, § 18 Abs. 2 MStV)',
              admin: {
                description: 'Name; the address above applies. Leave empty to use the operator name.',
              },
            },
            {
              name: 'imprintExtra',
              type: 'textarea',
              label: 'Additional text at the end of the legal notice',
            },
          ],
        },
        {
          label: 'Privacy',
          description:
            'Privacy policy. The site itself only uses server logs, YouTube (after consent) and local storage.',
          fields: [
            {
              name: 'hostName',
              type: 'text',
              label: 'Hosting provider (company name)',
              admin: { description: 'e.g. Railway Corporation or Hetzner Online GmbH' },
            },
            { name: 'hostAddress', type: 'text', label: 'Hosting provider address' },
            {
              name: 'hostLocation',
              type: 'text',
              label: 'Where the server is located',
              admin: { description: 'e.g. Amsterdam, Netherlands (EU)' },
            },
            {
              name: 'hostOutsideEu',
              type: 'checkbox',
              label: 'The hosting provider is a company outside the EU/EEA (e.g. USA)',
              defaultValue: false,
            },
            {
              name: 'hostPrivacyUrl',
              type: 'text',
              label: 'Link to the privacy policy of the hosting provider',
            },
            {
              name: 'privacyExtra',
              type: 'textarea',
              label: 'Additional text at the end of the privacy policy',
            },
          ],
        },
        {
          label: 'Shop',
          description:
            'Selling prints of the photos (Exhibitions → Images and videos → Prints for sale). Payment through Stripe, e-mails through SMTP (see README). The cart shows everything below before the buyer pays.',
          fields: [
            {
              // Checklist: open or closed for visitors, and what is missing
              name: 'shopStatus',
              type: 'ui',
              admin: { components: { Field: '/components/ShopStatus#ShopStatus' } },
            },
            {
              name: 'shopEnabled',
              type: 'checkbox',
              label: 'Shop is open (show prints and the cart on the website)',
              defaultValue: false,
              admin: {
                description:
                  'Only takes effect with the Stripe keys and at least one shipping zone. Open it once the legal notice, terms and shipping zones are filled in.',
              },
            },
            {
              name: 'shopEmail',
              type: 'email',
              label: 'E-mail for new orders and price requests',
              admin: { description: 'Empty = the e-mail of the legal notice.' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'vatMode',
                  type: 'select',
                  label: 'VAT',
                  defaultValue: 'smallBusiness',
                  required: true,
                  options: [
                    { label: 'Small business, no VAT charged', value: 'smallBusiness' },
                    { label: 'Prices include VAT', value: 'included' },
                  ],
                  admin: { width: '50%', isClearable: false },
                },
                {
                  name: 'vatRate',
                  type: 'number',
                  label: 'VAT rate in %',
                  min: 0,
                  max: 30,
                  defaultValue: 20,
                  admin: { width: '50%', condition: (data) => data?.vatMode === 'included' },
                },
              ],
            },
            {
              name: 'smallBusinessNote',
              type: 'text',
              label: 'Note for small businesses',
              maxLength: 200,
              admin: {
                condition: (data) => data?.vatMode !== 'included',
                description:
                  'Empty = the standard note of the country (Austria: § 6 Abs. 1 Z 27 UStG, Germany: § 19 UStG).',
              },
            },
            {
              name: 'shippingZones',
              type: 'array',
              label: 'Shipping zones',
              labels: { singular: 'Zone', plural: 'Zones' },
              maxRows: 20,
              admin: {
                description:
                  'Where you ship to and what it costs per order. Buyers choose their country in the cart; countries without a zone cannot order.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'name',
                      type: 'text',
                      label: 'Name',
                      required: true,
                      maxLength: 60,
                      admin: { width: '34%', placeholder: 'e.g. Austria' },
                    },
                    {
                      name: 'price',
                      type: 'number',
                      label: 'Shipping cost per order (EUR)',
                      min: 0,
                      max: 10000,
                      required: true,
                      admin: { width: '33%', step: 0.01 },
                    },
                    {
                      name: 'freeFrom',
                      type: 'number',
                      label: 'Free shipping from (EUR)',
                      min: 0,
                      max: 1000000,
                      admin: { width: '33%', step: 0.01, description: 'Empty = never free.' },
                    },
                  ],
                },
                {
                  name: 'countries',
                  type: 'select',
                  label: 'Countries',
                  hasMany: true,
                  required: true,
                  options: COUNTRY_OPTIONS,
                },
                {
                  name: 'deliveryTime',
                  type: 'text',
                  label: 'Delivery time',
                  required: true,
                  maxLength: 80,
                  admin: { placeholder: 'e.g. 5–8 working days' },
                },
              ],
            },
            {
              name: 'shopNote',
              type: 'textarea',
              label: 'Note in the cart',
              maxLength: 1000,
              admin: { description: 'Optional, e.g. “Prints are made to order and checked by hand.”' },
            },
            {
              type: 'collapsible',
              label: 'Watermark',
              admin: {
                description:
                  'Laid lightly over every photo that is for sale (fixed price or price on request), wherever it is shown on the website. Photos with “No price” stay without. Each exhibition can choose its own image.',
              },
              fields: [
                {
                  name: 'watermarkImage',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Watermark image',
                  admin: {
                    description:
                      'PNG with transparency (e.g. a white logo). Empty = the built-in “TRIPNJUNGLE” lettering. The image itself is never shown on its own.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'watermarkOpacity',
                      type: 'number',
                      label: 'Opacity in %',
                      min: 5,
                      max: 60,
                      defaultValue: 18,
                      admin: { width: '33%' },
                    },
                    {
                      name: 'watermarkSize',
                      type: 'number',
                      label: 'Size in % of the photo width',
                      min: 10,
                      max: 90,
                      defaultValue: 35,
                      admin: { width: '33%' },
                    },
                    {
                      name: 'watermarkPosition',
                      type: 'select',
                      label: 'Position',
                      defaultValue: 'center',
                      options: [
                        { label: 'Center', value: 'center' },
                        { label: 'Bottom right', value: 'bottomRight' },
                        { label: 'Tiled over the whole photo', value: 'tiled' },
                      ],
                      admin: { width: '34%', isClearable: false },
                    },
                  ],
                },
              ],
            },
            {
              name: 'termsText',
              type: 'textarea',
              label: 'Terms and conditions (AGB)',
              admin: {
                description:
                  'Shown on /terms and sent with every order confirmation. Empty = the standard terms (see /terms). Blank line = new paragraph, a line starting with “## ” = heading. Have them checked before going live.',
              },
            },
            {
              name: 'withdrawalText',
              type: 'textarea',
              label: 'Right of withdrawal (Widerrufsbelehrung)',
              admin: {
                description:
                  'Shown on /withdrawal and sent with every order confirmation. Empty = the EU model instructions with the details of the legal notice and the model withdrawal form.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'mailProviderName',
                  type: 'text',
                  label: 'E-mail provider (for the privacy policy)',
                  admin: { width: '50%', description: 'Who sends the shop e-mails (SMTP), e.g. your mail host.' },
                },
                {
                  name: 'mailProviderAddress',
                  type: 'text',
                  label: 'E-mail provider address',
                  admin: { width: '50%' },
                },
              ],
            },
          ],
        },
        {
          label: 'QR codes',
          description:
            'Printable QR labels for the photos (Exhibitions → Images and videos → QR code). Each code leads to the photo page via a short link that keeps working when addresses change.',
          fields: [
            {
              name: 'qrFormat',
              type: 'select',
              label: 'Label size',
              defaultValue: 'a6',
              options: [
                { label: 'A6 (105 × 148 mm)', value: 'a6' },
                { label: 'A5 (148 × 210 mm)', value: 'a5' },
                { label: 'Square 10 × 10 cm', value: 'square100' },
              ],
              admin: { isClearable: false },
            },
            {
              type: 'row',
              fields: [
                { name: 'qrShowTitle', type: 'checkbox', label: 'Show photo name', defaultValue: true },
                { name: 'qrShowArtist', type: 'checkbox', label: 'Show artist', defaultValue: true },
                { name: 'qrShowExhibition', type: 'checkbox', label: 'Show exhibition', defaultValue: true },
              ],
            },
            {
              name: 'qrFooter',
              type: 'text',
              label: 'Small text at the bottom',
              defaultValue: 'Scan to view online',
              maxLength: 80,
            },
          ],
        },
      ],
    },
  ],
}
