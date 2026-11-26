import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`login_attempts\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`lock_until\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`login_attempts\` numeric DEFAULT 0;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`lock_until\` text;`)
}
