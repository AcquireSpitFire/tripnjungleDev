import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`terms_accepted_at\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`terms_accepted_version\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`terms_accepted_text\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`contributor_terms_text\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`terms_accepted_at\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`terms_accepted_version\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`terms_accepted_text\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`contributor_terms_text\`;`)
}
