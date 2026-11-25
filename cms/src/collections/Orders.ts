import type { CollectionConfig, Field, FieldAccess } from 'payload'

import { canManageShop, isAdmin } from '../access/roles'
import { sendShippedEmail } from '../lib/shop/emails'

// Orders of prints (release 3.0). Created only by the server (src/lib/shop/checkout.ts) when a
// buyer goes to the Stripe payment page, completed by the Stripe webhook (src/lib/shop/webhook.ts).
// Managers of the section "Shop" see them and change the status (shipped, cancelled, refunded)
// and the tracking details. Everything the buyer agreed to (items, prices, address) is a
// snapshot that cannot be changed afterwards.
//
// Status and stock (src/lib/shop/stock.ts):
//   pending          checkout started, the copies are held until "expiresAt"
//   awaitingPayment  paid with a delayed method (e.g. SEPA direct debit), copies held
//   paid             paid – to be shipped
//   shipped          shipped
//   cancelled        expired, failed or cancelled – the copies are free again
//   refunded         refunded in Stripe – the copies are free again
export const ORDER_STATUS_OPTIONS = [
  { label: 'Checkout started (not paid)', value: 'pending' },
  { label: 'Payment pending (e.g. SEPA)', value: 'awaitingPayment' },
  { label: 'Paid – to ship', value: 'paid' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Cancelled / expired', value: 'cancelled' },
  { label: 'Refunded', value: 'refunded' },
] as const

// Statuses whose copies count as taken (besides "pending" until it expires)
export const HOLDING_STATUSES = ['awaitingPayment', 'paid', 'shipped'] as const

// Only the server writes these (overrideAccess); in the admin they are read-only
const serverOnly: { access: { create: FieldAccess; update: FieldAccess } } = {
  access: { create: () => false, update: () => false },
}

const money = (name: string, label: string): Field => ({
  name,
  label,
  type: 'number',
  ...serverOnly,
  admin: { readOnly: true, step: 0.01, width: '33%' },
})

const readOnlyText = (name: string, label: string, width?: string): Field => ({
  name,
  label,
  type: 'text',
  ...serverOnly,
  admin: { readOnly: true, ...(width ? { width } : {}) },
})

// Address as Stripe returns it; the country is the ISO code (AT, DE, …)
const addressFields: Field[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'line1', label: 'Address', type: 'text' },
  { name: 'line2', label: 'Address line 2', type: 'text' },
  {
    type: 'row',
    fields: [
      { name: 'postalCode', label: 'Postal code', type: 'text', admin: { width: '25%' } },
      { name: 'city', label: 'City', type: 'text', admin: { width: '35%' } },
      { name: 'state', label: 'State / region', type: 'text', admin: { width: '25%' } },
      { name: 'country', label: 'Country', type: 'text', admin: { width: '15%' } },
    ],
  },
]

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Order', plural: 'Orders' },
  admin: {
    useAsTitle: 'orderNumber',
    group: 'Shop',
    defaultColumns: ['orderNumber', 'status', 'customerName', 'total', 'createdAt'],
    listSearchableFields: ['orderNumber', 'customerName', 'customerEmail'],
    hidden: ({ user }) => !canManageShop(user),
    description:
      'Orders from the website. “Checkout started” holds the copies for 35 minutes, then they are free again. Set “Shipped” (with tracking) once the parcel is out. Refunds are made in the Stripe dashboard, then set “Refunded” here.',
  },
  access: {
    read: ({ req }) => canManageShop(req.user),
    // Only the server creates orders (checkout)
    create: () => false,
    update: ({ req }) => canManageShop(req.user),
    // Orders are business records (retention periods): only admins delete, e.g. test orders
    delete: ({ req }) => isAdmin(req.user),
  },
  defaultSort: '-createdAt',
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (operation !== 'update' || doc.status !== 'shipped' || previousDoc?.status === 'shipped' || context.tjShippedStamp) {
          return doc
        }

        // "Shipped on" is a server-only field: stamp it with overrideAccess (marked in the
        // context so this hook does not run a second time)
        const stamped = await req.payload.update({
          collection: 'orders',
          id: doc.id,
          data: { shippedAt: new Date().toISOString() },
          overrideAccess: true,
          context: { tjShippedStamp: true },
          req,
        })

        if (doc.notifyOnShipping !== false) {
          // An e-mail problem must not undo the status change; it is noted on the order
          await sendShippedEmail(req.payload, stamped).catch(async (error) => {
            req.payload.logger.error({ err: error, msg: `Shipping e-mail for ${doc.orderNumber} failed` })
            await req.payload.update({
              collection: 'orders',
              id: doc.id,
              data: {
                internalNote: [doc.internalNote, `${new Date().toISOString()}: the shipping e-mail could not be sent.`]
                  .filter(Boolean)
                  .join('\n'),
              },
              overrideAccess: true,
              context: { tjShippedStamp: true },
              req,
            })
          })
        }

        return stamped
      },
    ],
  },
  fields: [
    { ...readOnlyText('orderNumber', 'Order number'), index: true } as Field,
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [...ORDER_STATUS_OPTIONS],
      admin: { position: 'sidebar', isClearable: false },
    },
    {
      name: 'trackingNumber',
      label: 'Tracking number',
      type: 'text',
      maxLength: 100,
      admin: { position: 'sidebar' },
    },
    {
      name: 'trackingUrl',
      label: 'Tracking link',
      type: 'text',
      maxLength: 500,
      admin: { position: 'sidebar', description: 'https://… of the parcel service, sent to the buyer.' },
      validate: (value: unknown) =>
        !value || (typeof value === 'string' && /^https:\/\/\S+$/.test(value)) ? true : 'Only https:// links.',
    },
    {
      name: 'notifyOnShipping',
      label: 'E-mail the buyer when set to “Shipped”',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'paidAt',
      label: 'Paid on',
      type: 'date',
      ...serverOnly,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'shippedAt',
      label: 'Shipped on',
      type: 'date',
      ...serverOnly,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'expiresAt',
      label: 'Copies held until',
      type: 'date',
      index: true,
      ...serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data?.status === 'pending',
      },
    },
    {
      // Set by the withdrawal function on /withdrawal (the buyer gets an acknowledgement)
      name: 'withdrawalReceivedAt',
      label: 'Withdrawal received',
      type: 'date',
      ...serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => Boolean(data?.withdrawalReceivedAt),
      },
    },
    {
      name: 'withdrawalStatement',
      label: 'Withdrawal statement',
      type: 'textarea',
      ...serverOnly,
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.withdrawalReceivedAt) },
    },
    {
      name: 'internalNote',
      label: 'Internal note',
      type: 'textarea',
      maxLength: 5000,
      admin: { position: 'sidebar', description: 'Only visible here. Problems with payment or e-mails are noted here too.' },
    },
    {
      name: 'items',
      label: 'Items',
      type: 'array',
      ...serverOnly,
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'photoName', label: 'Photo', type: 'text', admin: { width: '40%' } },
            { name: 'artistName', label: 'Artist', type: 'text', admin: { width: '30%' } },
            { name: 'exhibitionTitle', label: 'Exhibition', type: 'text', admin: { width: '30%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'printLabel', label: 'Print', type: 'text', admin: { width: '40%' } },
            { name: 'size', label: 'Size', type: 'text', admin: { width: '30%' } },
            { name: 'material', label: 'Paper / material', type: 'text', admin: { width: '30%' } },
          ],
        },
        { name: 'details', label: 'Details', type: 'textarea' },
        {
          type: 'row',
          fields: [
            { name: 'quantity', label: 'Quantity', type: 'number', admin: { width: '33%' } },
            { name: 'unitPrice', label: 'Unit price (EUR)', type: 'number', admin: { width: '33%' } },
            { name: 'lineTotal', label: 'Total (EUR)', type: 'number', admin: { width: '33%' } },
          ],
        },
        // References for the stock count and for finding the photo again
        { name: 'exhibition', label: 'Exhibition', type: 'relationship', relationTo: 'exhibitions' },
        { name: 'exhibitionSlug', type: 'text', admin: { hidden: true } },
        { name: 'mediaId', label: 'Photo ID', type: 'text' },
        { name: 'printId', type: 'text', index: true, admin: { hidden: true } },
      ],
    },
    {
      type: 'row',
      fields: [money('subtotal', 'Items (EUR)'), money('shippingCost', 'Shipping (EUR)'), money('total', 'Total (EUR)')],
    },
    {
      type: 'row',
      fields: [readOnlyText('vatNote', 'VAT', '50%'), money('vatAmount', 'Contained VAT (EUR)')],
    },
    {
      type: 'row',
      fields: [readOnlyText('shippingZone', 'Shipping zone', '50%'), readOnlyText('deliveryTime', 'Delivery time promised', '50%')],
    },
    {
      type: 'collapsible',
      label: 'Buyer',
      fields: [
        {
          type: 'row',
          fields: [
            readOnlyText('customerName', 'Name', '34%'),
            {
              name: 'customerEmail',
              label: 'E-mail',
              type: 'email',
              ...serverOnly,
              admin: { readOnly: true, width: '33%' },
            },
            readOnlyText('customerPhone', 'Phone', '33%'),
          ],
        },
        {
          name: 'shippingAddress',
          label: 'Shipping address',
          type: 'group',
          ...serverOnly,
          admin: { readOnly: true },
          fields: addressFields,
        },
        {
          name: 'billingAddress',
          label: 'Billing address',
          type: 'group',
          ...serverOnly,
          admin: { readOnly: true },
          fields: addressFields,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Stripe',
      admin: { initCollapsed: true },
      fields: [
        { ...readOnlyText('stripeSessionId', 'Checkout session'), index: true } as Field,
        readOnlyText('stripePaymentIntent', 'Payment (search for it in the Stripe dashboard)'),
        {
          name: 'confirmationSent',
          label: 'Order confirmation sent',
          type: 'checkbox',
          ...serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
