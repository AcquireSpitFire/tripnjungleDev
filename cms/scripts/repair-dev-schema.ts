// Repairs a LOCAL development database whose automatic schema push ("npm run dev") fails with
// "index … already exists".
//
// Why: when "npm run dev" adds a column with a reference (e.g. exhibitions.watermark_id) to an
// existing SQLite table, drizzle-kit adds it without the foreign key. Every later start then wants
// to rebuild that table and writes the index statements twice – the second one fails and the
// server does not start. Production is not affected: it uses the migrations in src/migrations.
//
// What it does: makes a copy of the database file first, then runs the pending schema statements
// of the push with foreign keys switched off and every index statement only once, and checks that
// every table still has the same number of rows and no reference is broken.
//
//   cd cms && npx tsx --env-file=.env scripts/repair-dev-schema.ts          (shows what it would do)
//   cd cms && npx tsx --env-file=.env scripts/repair-dev-schema.ts --yes    (repairs)
import fs from 'fs'
import path from 'path'

import { requireConfirmation } from './confirm'

// Skip the automatic push while starting Payload (it is what fails)
process.env.PAYLOAD_MIGRATING = 'true'

type Adapter = {
  schema: unknown
  drizzle: unknown
  tablesFilter?: string[]
  requireDrizzleKit: () => {
    pushSchema: (...args: unknown[]) => Promise<{ statementsToExecute: string[]; hasDataLoss: boolean; warnings: string[] }>
  }
  execute: (args: { drizzle: unknown; raw: string }) => Promise<{ rows: Record<string, unknown>[] }>
}

function databaseFile(): string | null {
  const uri = process.env.DATABASE_URI || 'file:./tripnjungle.db'

  return uri.startsWith('file:') ? path.resolve(uri.slice('file:'.length).split('?')[0]) : null
}

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Only for local development databases. Production uses the migrations (npm start).')
    process.exit(1)
  }

  const file = databaseFile()

  if (!file || !fs.existsSync(file)) {
    console.error('Only for a local SQLite file (DATABASE_URI=file:…), not found: ' + (file ?? process.env.DATABASE_URI))
    process.exit(1)
  }

  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const adapter = payload.db as unknown as Adapter
  const { pushSchema } = adapter.requireDrizzleKit()
  const { statementsToExecute, hasDataLoss, warnings } = await pushSchema(
    adapter.schema,
    adapter.drizzle,
    undefined,
    adapter.tablesFilter,
    undefined,
  )
  // Only repeated index statements are dropped (that is the bug). The foreign key switches are
  // handled once around the whole repair: with foreign keys on, dropping a rebuilt table would
  // delete the rows that refer to it.
  const seenIndexes = new Set<string>()
  const statements = statementsToExecute
    .map((statement) => statement.trim())
    .filter((statement) => !/^PRAGMA foreign_keys\s*=/i.test(statement))
    .filter((statement) => {
      if (!/^CREATE (UNIQUE )?INDEX/i.test(statement)) {
        return true
      }

      if (seenIndexes.has(statement)) {
        return false
      }

      seenIndexes.add(statement)
      return true
    })

  if (!statements.length) {
    console.log('The database is up to date, nothing to repair.')
    process.exit(0)
  }

  console.log(`${statements.length} schema statements to run (repeated index statements skipped):`)

  for (const statement of statements) {
    console.log('  ' + statement.replace(/\s+/g, ' ').slice(0, 140))
  }

  if (hasDataLoss || warnings.length) {
    console.error('\nThe push reports possible data loss – not repairing automatically:\n' + warnings.join('\n'))
    process.exit(1)
  }

  requireConfirmation('\nRepair the schema of the local database')

  const backup = file.replace(/\.db$/, '') + `.before-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  const tables = async () =>
    (
      await adapter.execute({
        drizzle: adapter.drizzle,
        raw: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__new_%'",
      })
    ).rows.map((row) => String(row.name))
  const counts = async (names: string[]) => {
    const result = new Map<string, number>()

    for (const name of names) {
      const { rows } = await adapter.execute({ drizzle: adapter.drizzle, raw: `SELECT count(*) AS n FROM \`${name}\`` })

      result.set(name, Number(rows[0]?.n ?? 0))
    }

    return result
  }

  fs.copyFileSync(file, backup)
  console.log(`Backup: ${backup}`)

  const before = await counts(await tables())

  await adapter.execute({ drizzle: adapter.drizzle, raw: 'PRAGMA foreign_keys=OFF' })

  try {
    for (const statement of statements) {
      await adapter.execute({ drizzle: adapter.drizzle, raw: statement })
    }
  } finally {
    await adapter.execute({ drizzle: adapter.drizzle, raw: 'PRAGMA foreign_keys=ON' })
  }

  const after = await counts([...before.keys()])
  const changed = [...before].filter(([name, count]) => after.get(name) !== count)

  if (changed.length) {
    console.error('Row counts differ after the repair – restore the backup:', changed)
    process.exit(1)
  }

  const { rows: problems } = await adapter.execute({ drizzle: adapter.drizzle, raw: 'PRAGMA foreign_key_check' })

  console.log(`Done. ${before.size} tables, row counts unchanged, ${problems.length} foreign key problems.`)
  process.exit(problems.length ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
