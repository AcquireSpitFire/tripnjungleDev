import { sqliteAdapter } from '@payloadcms/db-sqlite'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Exhibitions } from './collections/Exhibitions'
import { Artists } from './collections/Artists'
import { Site } from './globals/Site'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'

export default buildConfig({
  serverURL,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Exhibitions, Artists, Media, Users],
  globals: [Site],
  // No rich text editor needed (only text fields) – saves dependencies and attack surface
  secret: process.env.PAYLOAD_SECRET || '',
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
