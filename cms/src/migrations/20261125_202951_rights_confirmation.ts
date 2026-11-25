import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`rights_confirmed\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`rights_confirmed_at\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`rights_confirmed_by\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`rights_confirmed\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`rights_confirmed_at\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`rights_confirmed_by\`;`)
}
