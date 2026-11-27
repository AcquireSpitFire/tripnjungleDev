import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site\` ADD \`mail_provider_outside_eu\` integer;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`manufacturer\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`safety_information\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`mail_provider_outside_eu\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`manufacturer\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`safety_information\`;`)
}
