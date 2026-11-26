// Site settings → About: site description for search engines, About text, contact address.
import type { Tab } from 'payload'

export const aboutTab: Tab = {
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
}
