import { sqliteAdapter } from '@payloadcms/db-sqlite'
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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'

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

export default buildConfig({
  serverURL,
  admin: {
    user: Users.slug,
    components: {
      // Visible "Log out" button with the logged-in account (top right on every admin page)
      actions: ['/components/LogoutAction#LogoutAction'],
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
