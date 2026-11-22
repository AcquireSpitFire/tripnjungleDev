import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Release 2.0: English field names.
//   exhibitions.titel        → exhibitions.title
//   exhibitions_medien table → exhibitions_gallery (array field "medien" → "gallery")
//
// Written by hand: the generator would drop the old column/table and create new
// ones (all titles and gallery rows would be lost). RENAME keeps the data.
// The schema snapshot (.json) comes from scripts/write-schema-snapshot.ts.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`exhibitions\` RENAME COLUMN \`titel\` TO \`title\`;`)
  await db.run(sql`ALTER TABLE \`exhibitions_medien\` RENAME TO \`exhibitions_gallery\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_medien_order_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_medien_parent_id_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_medien_file_idx\`;`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_order_idx\` ON \`exhibitions_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_parent_id_idx\` ON \`exhibitions_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_file_idx\` ON \`exhibitions_gallery\` (\`file_id\`);`)
  // Admin preferences (collapsed array rows, list columns) refer to the old field names
  await db.run(sql`UPDATE \`payload_preferences\`
    SET \`value\` = REPLACE(REPLACE(\`value\`, '"medien"', '"gallery"'), '"titel"', '"title"')
    WHERE \`key\` LIKE 'collection-exhibitions%';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`UPDATE \`payload_preferences\`
    SET \`value\` = REPLACE(REPLACE(\`value\`, '"gallery"', '"medien"'), '"title"', '"titel"')
    WHERE \`key\` LIKE 'collection-exhibitions%';`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_gallery_order_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_gallery_parent_id_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`exhibitions_gallery_file_idx\`;`)
  await db.run(sql`ALTER TABLE \`exhibitions_gallery\` RENAME TO \`exhibitions_medien\`;`)
  await db.run(sql`CREATE INDEX \`exhibitions_medien_order_idx\` ON \`exhibitions_medien\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_medien_parent_id_idx\` ON \`exhibitions_medien\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_medien_file_idx\` ON \`exhibitions_medien\` (\`file_id\`);`)
  await db.run(sql`ALTER TABLE \`exhibitions\` RENAME COLUMN \`title\` TO \`titel\`;`)
}
