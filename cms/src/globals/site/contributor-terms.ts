// Site settings → Contributor terms every non-admin account accepts (src/lib/contributor-terms.ts).
import type { Tab } from 'payload'

export const contributorTermsTab: Tab = {
  label: 'Contributor terms',
  description:
    'Terms every account except admins (artists, editors, managers) has to accept on its account page before uploading or changing anything. Accepting is stored on the account with date, version and a copy of the text. Any change of the text has to be accepted again.',
  fields: [
    {
      name: 'contributorTermsText',
      type: 'textarea',
      label: 'Terms for contributor accounts',
      admin: {
        description:
          'Empty = the standard text (responsibility for uploads, indemnity if at fault, rights of use, removal). Blank line = new paragraph, a line starting with “## ” = heading. Have it checked before going live.',
      },
    },
  ],
}
