// Site settings → Privacy: hosting provider and extra text for /privacy (src/app/privacy/route.ts).
import type { Tab } from 'payload'

export const privacyTab: Tab = {
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
}
