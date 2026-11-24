// Writes the drizzle schema snapshot (.json) for a hand-written migration.
// Needed when "payload migrate:create" cannot run non-interactively, e.g. for
// renames (it asks "created or renamed?" in the terminal):
//   cd cms && PAYLOAD_MIGRATING=true npx tsx --env-file=.env scripts/write-schema-snapshot.ts <migration-name>
// Writes src/migrations/<migration-name>.json; the .ts file is written by hand.
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'

import config from '../src/payload.config'

async function run() {
  const name = process.argv[2]

  if (!name || !/^\d{8}_\d{6}_\w+$/.test(name)) {
    console.error('Usage: write-schema-snapshot.ts <yyyymmdd_hhmmss_name>')
    process.exit(1)
  }

  process.env.PAYLOAD_MIGRATING = 'true'

  const payload = await getPayload({ config })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = payload.db as any
  const { generateDrizzleJson } = db.requireDrizzleKit()
  const snapshot = await generateDrizzleJson(db.schema)
  const file = path.join(db.migrationDir, name + '.json')

  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2))
  console.log('Written: ' + file)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
