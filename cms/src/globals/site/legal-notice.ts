// Site settings → Legal notice (Impressum): operator, business purpose, responsible person. Shown on /imprint (src/app/imprint/route.ts).
import type { Tab } from 'payload'

export const legalNoticeTab: Tab = {
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
      admin: {
        description:
          'What you do. With the shop open, name the sale of prints too, e.g. “Online gallery of photo and video exhibitions and sale of photo prints”.',
      },
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
}
