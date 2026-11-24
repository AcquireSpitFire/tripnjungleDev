import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Release 2.0: QR label settings (Site settings → QR codes).

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site\` ADD \`qr_format\` text DEFAULT 'a6';`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`qr_show_title\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`qr_show_artist\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`qr_show_exhibition\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`qr_footer\` text DEFAULT 'Scan to view online';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`qr_format\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`qr_show_title\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`qr_show_artist\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`qr_show_exhibition\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`qr_footer\`;`)
}
