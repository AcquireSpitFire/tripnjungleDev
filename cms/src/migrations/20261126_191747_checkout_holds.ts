import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`orders\` ADD \`hold_key\` text;`)
  await db.run(sql`CREATE INDEX \`orders_hold_key_idx\` ON \`orders\` (\`hold_key\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`orders_hold_key_idx\`;`)
  await db.run(sql`ALTER TABLE \`orders\` DROP COLUMN \`hold_key\`;`)
}
