import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Release 2.0: editor accounts per exhibition (field "editors").
// Generated, then edited by hand: ON DELETE CASCADE as in the snapshot (deleting an
// account removes its assignments).

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`exhibitions_rels\` ADD \`users_id\` integer REFERENCES users(id) ON DELETE CASCADE;`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_users_id_idx\` ON \`exhibitions_rels\` (\`users_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_exhibitions_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`artists_id\` integer,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artists_id\`) REFERENCES \`artists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_exhibitions_rels\`("id", "order", "parent_id", "path", "artists_id", "media_id") SELECT "id", "order", "parent_id", "path", "artists_id", "media_id" FROM \`exhibitions_rels\`;`)
  await db.run(sql`DROP TABLE \`exhibitions_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_exhibitions_rels\` RENAME TO \`exhibitions_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_order_idx\` ON \`exhibitions_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_parent_idx\` ON \`exhibitions_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_path_idx\` ON \`exhibitions_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_artists_id_idx\` ON \`exhibitions_rels\` (\`artists_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_media_id_idx\` ON \`exhibitions_rels\` (\`media_id\`);`)
}
