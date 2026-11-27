// Countries the shop can ship to (ISO 3166-1 alpha-2, as Stripe expects them).
// Which of them are actually offered comes from the shipping zones in Site settings → Shop.
const COUNTRIES = [
  ['AT', 'Austria'],
  ['DE', 'Germany'],
  ['CH', 'Switzerland'],
  ['LI', 'Liechtenstein'],
  ['IT', 'Italy'],
  ['FR', 'France'],
  ['NL', 'Netherlands'],
  ['BE', 'Belgium'],
  ['LU', 'Luxembourg'],
  ['DK', 'Denmark'],
  ['SE', 'Sweden'],
  ['FI', 'Finland'],
  ['IE', 'Ireland'],
  ['ES', 'Spain'],
  ['PT', 'Portugal'],
  ['PL', 'Poland'],
  ['CZ', 'Czechia'],
  ['SK', 'Slovakia'],
  ['SI', 'Slovenia'],
  ['HU', 'Hungary'],
  ['HR', 'Croatia'],
  ['RO', 'Romania'],
  ['BG', 'Bulgaria'],
  ['GR', 'Greece'],
  ['CY', 'Cyprus'],
  ['MT', 'Malta'],
  ['EE', 'Estonia'],
  ['LV', 'Latvia'],
  ['LT', 'Lithuania'],
  ['NO', 'Norway'],
  ['IS', 'Iceland'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['JP', 'Japan'],
] as const

export type CountryCode = (typeof COUNTRIES)[number][0]

export const COUNTRY_OPTIONS = COUNTRIES.map(([value, label]) => ({ label, value }))

export function countryName(code: string | null | undefined): string {
  return COUNTRIES.find(([value]) => value === code)?.[1] || code || ''
}

// Member states of the EU (customs union, VAT area). Deliveries elsewhere may cost the buyer
// import duties and taxes – the cart and the payment page say so.
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
])

export function isEuCountry(code: string | null | undefined): boolean {
  return Boolean(code && EU_COUNTRIES.has(code))
}

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRIES.some(([code]) => code === value)
}
