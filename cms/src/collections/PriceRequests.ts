import type { CollectionConfig } from 'payload'

import { canManageShop } from '../access/roles'
import { readOnlyText, serverOnly } from '../fields/server-only'

// "Request price" for prints with "Price on request". Created only by the server
// (src/app/shop/request/route.ts), which also e-mails the shop address with Reply-To set to the
// visitor. Only managers of the section "Shop" see them; they answer by e-mail and set the
// status. Nothing is sent to the visitor's address automatically (no spam relay).

export const PriceRequests: CollectionConfig = {
  slug: 'price-requests',
  labels: { singular: 'Price request', plural: 'Price requests' },
  admin: {
    useAsTitle: 'email',
    group: 'Shop',
    defaultColumns: ['email', 'photoName', 'printLabel', 'status', 'createdAt'],
    hidden: ({ user }) => !canManageShop(user),
    description:
      'Requests for prints with “Price on request” (also sent to the shop e-mail). Answer by e-mail, then set the status. Delete requests once they are settled.',
  },
  access: {
    read: ({ req }) => canManageShop(req.user),
    create: () => false,
    update: ({ req }) => canManageShop(req.user),
    delete: ({ req }) => canManageShop(req.user),
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'open',
      required: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Answered', value: 'answered' },
        { label: 'Closed', value: 'closed' },
      ],
      admin: { position: 'sidebar', isClearable: false },
    },
    {
      name: 'internalNote',
      label: 'Internal note',
      type: 'textarea',
      maxLength: 5000,
      admin: { position: 'sidebar' },
    },
    readOnlyText('name', 'Name'),
    {
      name: 'email',
      label: 'E-mail',
      type: 'email',
      required: true,
      access: serverOnly,
      admin: { readOnly: true },
    },
    {
      name: 'message',
      label: 'Message',
      type: 'textarea',
      access: serverOnly,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        readOnlyText('photoName', 'Photo', '34%'),
        readOnlyText('printLabel', 'Print', '33%'),
        readOnlyText('exhibitionTitle', 'Exhibition', '33%'),
      ],
    },
    readOnlyText('photoUrl', 'Photo page'),
    {
      name: 'exhibition',
      label: 'Exhibition',
      type: 'relationship',
      relationTo: 'exhibitions',
      access: serverOnly,
      admin: { readOnly: true },
    },
    { name: 'printId', type: 'text', access: serverOnly, admin: { hidden: true } },
  ],
}
