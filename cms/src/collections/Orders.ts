import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Field,
} from 'payload'

import { canManageShop, isAdmin } from '../access/roles'
import { hiddenServerOnly, readOnlyText, serverOnly } from '../fields/server-only'
import { sendShippedEmail } from '../lib/shop/emails'
import { withNote } from '../lib/shop/order-note'
import { ORDER_STATUS_OPTIONS } from '../lib/shop/order-status'

// Orders of prints. Created only by the server (src/lib/shop/checkout.ts) when a
// buyer goes to the Stripe payment page, completed by the Stripe webhook (src/lib/shop/webhook.ts).
// Managers of the section "Shop" see them and change the status (shipped, cancelled, refunded)
// and the tracking details. Everything the buyer agreed to (items, prices, address) is a
// snapshot that cannot be changed afterwards. The statuses: src/lib/shop/order-status.ts.

const money = (name: string, label: string): Field => ({
  name,
  label,
  type: 'number',
  access: serverOnly,
  admin: { readOnly: true, step: 0.01, width: '33%' },
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

// Context flag of the server's own follow-up updates: they must not run the shipping hook again
const SKIP_SHIPPING_HOOK = 'skipShippingHook'

// The anonymous connection key is only needed while the checkout runs (src/lib/shop/hold.ts)
const clearHoldKey: CollectionBeforeChangeHook = ({ data }) => {
  if (data.status && data.status !== 'pending') {
    data.holdKey = null
  }

  return data
}

// Set to "Shipped": stamp "Shipped on" (a server-only field, so with overrideAccess) and e-mail the
// buyer the tracking details. An e-mail problem must not undo the status change; it is noted on
// the order.
const stampShippedAndNotify: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  if (
    operation !== 'update' ||
    doc.status !== 'shipped' ||
    previousDoc?.status === 'shipped' ||
    context[SKIP_SHIPPING_HOOK]
  ) {
    return doc
  }

  const stamped = await req.payload.update({
    collection: 'orders',
    id: doc.id,
    data: { shippedAt: new Date().toISOString() },
    overrideAccess: true,
    context: { [SKIP_SHIPPING_HOOK]: true },
    req,
  })

  if (doc.notifyOnShipping !== false) {
    await sendShippedEmail(req.payload, stamped).catch(async (error) => {
      req.payload.logger.error({ err: error, msg: `Shipping e-mail for ${doc.orderNumber} failed` })
      await req.payload.update({
        collection: 'orders',
        id: doc.id,
        data: { internalNote: withNote(doc, 'the shipping e-mail could not be sent.') },
        overrideAccess: true,
        context: { [SKIP_SHIPPING_HOOK]: true },
        req,
      })
    })
  }

  return stamped
}

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
    beforeChange: [clearHoldKey],
    afterChange: [stampShippedAndNotify],
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
      admin: {
        position: 'sidebar',
        description: 'https://… of the parcel service, sent to the buyer.',
      },
      validate: (value: unknown) =>
        !value || (typeof value === 'string' && /^https:\/\/\S+$/.test(value))
          ? true
          : 'Only https:// links.',
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
      access: serverOnly,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'shippedAt',
      label: 'Shipped on',
      type: 'date',
      access: serverOnly,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'expiresAt',
      label: 'Copies held until',
      type: 'date',
      index: true,
      access: serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data?.status === 'pending',
      },
    },
    {
      // Anonymous key of the buyer's connection while a checkout with limited copies runs
      // (src/lib/shop/hold.ts): at most 2 such checkouts per connection. Removed when it ends.
      name: 'holdKey',
      type: 'text',
      index: true,
      access: hiddenServerOnly,
      admin: { hidden: true },
    },
    {
      // Set by the withdrawal function on /withdrawal (the buyer gets an acknowledgement)
      name: 'withdrawalReceivedAt',
      label: 'Withdrawal received',
      type: 'date',
      access: serverOnly,
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
      access: serverOnly,
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => Boolean(data?.withdrawalReceivedAt),
      },
    },
    {
      name: 'internalNote',
      label: 'Internal note',
      type: 'textarea',
      maxLength: 5000,
      admin: {
        position: 'sidebar',
        description: 'Only visible here. Problems with payment or e-mails are noted here too.',
      },
    },
    {
      name: 'items',
      label: 'Items',
      type: 'array',
      access: serverOnly,
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
            {
              name: 'unitPrice',
              label: 'Unit price (EUR)',
              type: 'number',
              admin: { width: '33%' },
            },
            { name: 'lineTotal', label: 'Total (EUR)', type: 'number', admin: { width: '33%' } },
          ],
        },
        // References for the stock count and for finding the photo again
        {
          name: 'exhibition',
          label: 'Exhibition',
          type: 'relationship',
          relationTo: 'exhibitions',
        },
        { name: 'exhibitionSlug', type: 'text', admin: { hidden: true } },
        { name: 'mediaId', label: 'Photo ID', type: 'text' },
        { name: 'printId', type: 'text', index: true, admin: { hidden: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        money('subtotal', 'Items (EUR)'),
        money('shippingCost', 'Shipping (EUR)'),
        money('total', 'Total (EUR)'),
      ],
    },
    {
      type: 'row',
      fields: [readOnlyText('vatNote', 'VAT', '50%'), money('vatAmount', 'Contained VAT (EUR)')],
    },
    {
      type: 'row',
      fields: [
        readOnlyText('shippingZone', 'Shipping zone', '50%'),
        readOnlyText('deliveryTime', 'Delivery time promised', '50%'),
      ],
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
              access: serverOnly,
              admin: { readOnly: true, width: '33%' },
            },
            readOnlyText('customerPhone', 'Phone', '33%'),
          ],
        },
        {
          name: 'shippingAddress',
          label: 'Shipping address',
          type: 'group',
          access: serverOnly,
          admin: { readOnly: true },
          fields: addressFields,
        },
        {
          name: 'billingAddress',
          label: 'Billing address',
          type: 'group',
          access: serverOnly,
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
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
