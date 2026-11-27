// Site settings → Shop: open/closed, VAT, shipping zones, watermark, terms and withdrawal texts (src/lib/shop/).
import type { Tab } from 'payload'

import { COUNTRY_OPTIONS } from '../../lib/shop/countries'

export const shopTab: Tab = {
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
          admin: {
            width: '50%',
            description: 'Who sends the shop e-mails (SMTP), e.g. your mail host.',
          },
        },
        {
          name: 'mailProviderAddress',
          type: 'text',
          label: 'E-mail provider address',
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'mailProviderOutsideEu',
      type: 'checkbox',
      label: 'The e-mail provider is a company outside the EU/EEA (e.g. USA)',
      admin: {
        description:
          'The privacy policy then names the transfer to a third country (adequacy decision or standard contractual clauses of the provider).',
      },
    },
    {
      // Product safety (GPSR, Regulation (EU) 2023/988, Art. 19): every offer names the manufacturer
      // and safety information; shown with the prints, in the cart and in the order confirmation
      type: 'collapsible',
      label: 'Product safety (GPSR)',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'manufacturer',
          type: 'textarea',
          label: 'Manufacturer (name, postal and e-mail address)',
          admin: {
            description:
              'Shown with every print. Empty = the operator of the legal notice – right when the prints are sold under your name, also if a lab makes them. Put the same details on a label on the back of each print or on its packaging.',
          },
        },
        {
          name: 'safetyInformation',
          type: 'textarea',
          label: 'Safety information (optional)',
          admin: {
            description:
              'Only if there is any, e.g. for framed prints with glass: “Glass – handle with care, hang with suitable fixings.”',
          },
        },
      ],
    },
  ],
}
