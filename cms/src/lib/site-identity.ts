// Name, description and public address of the site. Pages, e-mails, Stripe, QR codes and the
// sitemap build every absolute link from serverUrl(), so the address is set in one place:
// PAYLOAD_PUBLIC_SERVER_URL (e.g. https://tripnjungle.com, no trailing slash).

export const SITE_NAME = 'Tripnjungle'

export const SITE_DESCRIPTION = `${SITE_NAME} is Tom's web gallery: photo and video exhibitions from trips, nights out and everything in between.`

export const DEFAULT_SERVER_URL = 'http://localhost:3000'

export function serverUrl(): string {
  return (process.env.PAYLOAD_PUBLIC_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/+$/, '')
}
