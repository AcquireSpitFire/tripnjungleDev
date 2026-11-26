import type { Field } from 'payload'

import { exhibitionManagersOnlyField } from '../../access/roles'

// Prints of a photo that visitors can buy (src/lib/shop/), a field of every gallery item.
// Visitors read them with the photo (same read access as the gallery). Prints and prices are
// set by exhibition managers only; artists and editors keep the rows as they are.
// "No price" (default) shows nothing and adds no watermark. "Fixed price" and "Price on request"
// make the photo "for sale": it is shown with the watermark (src/lib/watermark.ts).
// The copies still left are not stored here but counted from the orders (src/lib/shop/stock.ts),
// so a purchase never writes into the exhibition.
export const printsField: Field = {
  name: 'prints',
  label: 'Prints for sale',
  type: 'array',
  labels: { singular: 'Print', plural: 'Prints' },
  maxRows: 10,
  access: { create: exhibitionManagersOnlyField, update: exhibitionManagersOnlyField },
  admin: {
    initCollapsed: true,
    description:
      'Optional: prints of this photo that visitors can order. “No price” shows nothing; with a fixed price or “Price on request” the print is shown below the photo and the photo gets the watermark. Photos only, not videos.',
  },
  fields: [
    {
      name: 'label',
      label: 'Name of the print',
      type: 'text',
      required: true,
      maxLength: 80,
      admin: { placeholder: 'e.g. Fine art print 30 × 40 cm' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'width',
          label: 'Width (cm)',
          type: 'number',
          min: 1,
          max: 1000,
          admin: { width: '25%' },
        },
        {
          name: 'height',
          label: 'Height (cm)',
          type: 'number',
          min: 1,
          max: 1000,
          admin: { width: '25%' },
        },
        {
          name: 'material',
          label: 'Paper / material',
          type: 'text',
          maxLength: 120,
          admin: { width: '50%', placeholder: 'e.g. Hahnemühle Photo Rag 308 g/m²' },
        },
      ],
    },
    {
      name: 'details',
      label: 'Further details',
      type: 'textarea',
      maxLength: 600,
      admin: {
        description:
          'Shown to buyers, in the cart and in the order confirmation: edition, signed/numbered, frame, production time …',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'pricing',
          label: 'Price',
          type: 'select',
          required: true,
          // As a function: applies in the form, but not as a column default in the database
          defaultValue: () => 'none',
          options: [
            { label: 'No price (not shown)', value: 'none' },
            { label: 'Fixed price (add to cart)', value: 'fixed' },
            { label: 'Price on request', value: 'request' },
          ],
          admin: { width: '34%', isClearable: false },
        },
        {
          name: 'price',
          label: 'Price in EUR (final price for the buyer)',
          type: 'number',
          min: 1,
          max: 100000,
          admin: {
            width: '33%',
            step: 0.01,
            condition: (_data, siblingData) => siblingData?.pricing === 'fixed',
            description: 'Empty = not shown, like “No price”.',
          },
        },
        {
          name: 'copies',
          label: 'Copies for sale in total',
          type: 'number',
          min: 0,
          max: 10000,
          admin: {
            width: '33%',
            step: 1,
            description: 'Empty = no limit (open edition). Visitors see how many are left.',
          },
        },
      ],
    },
  ],
}
