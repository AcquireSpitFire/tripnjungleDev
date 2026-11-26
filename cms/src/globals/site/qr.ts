// Site settings → QR labels of the photos (src/lib/qr.ts).
import type { Tab } from 'payload'

export const qrTab: Tab = {
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
}
