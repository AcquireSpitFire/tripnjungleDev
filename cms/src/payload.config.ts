import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Exhibitions } from './collections/Exhibitions'
import { Artists } from './collections/Artists'
import { Orders } from './collections/Orders'
import { PriceRequests } from './collections/PriceRequests'
import { Site } from './globals/Site'
import { SITE_NAME, serverUrl } from './lib/site-identity'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = serverUrl()

// The secret signs logins and sessions: a short or example value would let anyone forge them.
// (An empty one is rejected by Payload itself.)
const secret = process.env.PAYLOAD_SECRET || ''

if (secret && (secret.length < 32 || secret === 'YOUR_SECRET_HERE')) {
  throw new Error(
    'PAYLOAD_SECRET is too weak: use at least 32 random characters, e.g. the output of "openssl rand -hex 32".',
  )
}

// Without the real address, CORS/CSRF only allow localhost, cookies are not "secure" and
// QR codes / links point to localhost
if (process.env.NODE_ENV === 'production' && !process.env.PAYLOAD_PUBLIC_SERVER_URL) {
  console.warn(
    '\n⚠ PAYLOAD_PUBLIC_SERVER_URL is not set. Set it to the public address (https://…) of the site.\n',
  )
}

// E-mail (order confirmations, shipping notices, price requests, "Forgot password") over SMTP.
// Without SMTP_HOST no e-mail leaves the server: Payload writes them to the console instead.
const smtpPort = Number(process.env.SMTP_PORT || 587)
const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || ''

if (process.env.SMTP_HOST && !emailFrom) {
  throw new Error('EMAIL_FROM is missing: set the sender address of the e-mails (e.g. shop@your-domain.com).')
}

const email = process.env.SMTP_HOST
  ? nodemailerAdapter({
      defaultFromAddress: emailFrom,
      defaultFromName: process.env.EMAIL_FROM_NAME || SITE_NAME,
      // Do not block the start when the mail server is briefly unreachable
      skipVerify: true,
      transportOptions: {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        // 465 = TLS from the start, otherwise STARTTLS is required (never plain text)
        secure: smtpPort === 465,
        requireTLS: smtpPort !== 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      },
    })
  : undefined

export default buildConfig({
  serverURL,
  email,
  admin: {
    user: Users.slug,
    // No generated preview images (/api/og): unused, and a public endpoint that renders
    // arbitrary text costs CPU for every request
    meta: { defaultOGImageType: 'off' },
    components: {
      // Top right on every admin page: reminder to accept the contributor terms (only if needed),
      // then the visible "Log out" button with the logged-in account
      actions: [
        { path: '/components/ContributorTermsNotice#ContributorTermsNotice', clientProps: { variant: 'action' } },
        '/components/LogoutAction#LogoutAction',
      ],
      beforeDashboard: [
        { path: '/components/ContributorTermsNotice#ContributorTermsNotice', clientProps: { variant: 'dashboard' } },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Exhibitions, Artists, Media, Orders, PriceRequests, Users],
  globals: [Site],
  // No rich text editor needed (only text fields) – saves dependencies and attack surface
  secret,
  // Public API: no deep nesting (expensive queries), no GraphQL (unused)
  maxDepth: 2,
  graphQL: {
    disable: true,
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./tripnjungle.db',
    },
    // Production: tables come from src/migrations ("payload migrate" before the start),
    // development: the schema is adjusted automatically (push)
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  // Only our own origin may call the API from the browser.
  // The frontend is served from public/ by the same app.
  cors: [serverURL],
  csrf: [serverURL],
  sharp,
  plugins: [],
})
