import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Release 2.0: roles (admin, manager, artist, editor), sections, "created by"/"last changed by".
// Generated, then edited by hand: ON DELETE SET NULL for the account references (so an
// account can still be deleted) and all existing accounts become admin.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sections\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sections_order_idx\` ON \`users_sections\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`users_sections_parent_idx\` ON \`users_sections\` (\`parent_id\`);`)
  await db.run(sql`ALTER TABLE \`exhibitions\` ADD \`created_by_id\` integer REFERENCES users(id) ON DELETE SET NULL;`)
  await db.run(sql`ALTER TABLE \`exhibitions\` ADD \`updated_by_id\` integer REFERENCES users(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`exhibitions_created_by_idx\` ON \`exhibitions\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_updated_by_idx\` ON \`exhibitions\` (\`updated_by_id\`);`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`created_by_id\` integer REFERENCES users(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`media_created_by_idx\` ON \`media\` (\`created_by_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`name\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'editor' NOT NULL;`)
  // Until now every account could do everything: keep it that way, nobody is locked out
  await db.run(sql`UPDATE \`users\` SET \`role\` = 'admin';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sections\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_exhibitions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`title\` text NOT NULL,
  	\`theme\` text,
  	\`description\` text,
  	\`release\` text,
  	\`date\` text,
  	\`time\` text,
  	\`location\` text,
  	\`visibility\` text,
  	\`locked\` integer DEFAULT true,
  	\`video\` text,
  	\`front_page_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`front_page_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_exhibitions\`("id", "slug", "title", "theme", "description", "release", "date", "time", "location", "visibility", "locked", "video", "front_page_id", "updated_at", "created_at") SELECT "id", "slug", "title", "theme", "description", "release", "date", "time", "location", "visibility", "locked", "video", "front_page_id", "updated_at", "created_at" FROM \`exhibitions\`;`)
  await db.run(sql`DROP TABLE \`exhibitions\`;`)
  await db.run(sql`ALTER TABLE \`__new_exhibitions\` RENAME TO \`exhibitions\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`exhibitions_slug_idx\` ON \`exhibitions\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_front_page_idx\` ON \`exhibitions\` (\`front_page_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_updated_at_idx\` ON \`exhibitions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_created_at_idx\` ON \`exhibitions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text,
  	\`name\` text,
  	\`locked\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumb_url\` text,
  	\`sizes_thumb_width\` numeric,
  	\`sizes_thumb_height\` numeric,
  	\`sizes_thumb_mime_type\` text,
  	\`sizes_thumb_filesize\` numeric,
  	\`sizes_thumb_filename\` text,
  	\`sizes_medium_url\` text,
  	\`sizes_medium_width\` numeric,
  	\`sizes_medium_height\` numeric,
  	\`sizes_medium_mime_type\` text,
  	\`sizes_medium_filesize\` numeric,
  	\`sizes_medium_filename\` text,
  	\`sizes_large_url\` text,
  	\`sizes_large_width\` numeric,
  	\`sizes_large_height\` numeric,
  	\`sizes_large_mime_type\` text,
  	\`sizes_large_filesize\` numeric,
  	\`sizes_large_filename\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_media\`("id", "alt", "name", "locked", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumb_url", "sizes_thumb_width", "sizes_thumb_height", "sizes_thumb_mime_type", "sizes_thumb_filesize", "sizes_thumb_filename", "sizes_medium_url", "sizes_medium_width", "sizes_medium_height", "sizes_medium_mime_type", "sizes_medium_filesize", "sizes_medium_filename", "sizes_large_url", "sizes_large_width", "sizes_large_height", "sizes_large_mime_type", "sizes_large_filesize", "sizes_large_filename") SELECT "id", "alt", "name", "locked", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumb_url", "sizes_thumb_width", "sizes_thumb_height", "sizes_thumb_mime_type", "sizes_thumb_filesize", "sizes_thumb_filename", "sizes_medium_url", "sizes_medium_width", "sizes_medium_height", "sizes_medium_mime_type", "sizes_medium_filesize", "sizes_medium_filename", "sizes_large_url", "sizes_large_width", "sizes_large_height", "sizes_large_mime_type", "sizes_large_filesize", "sizes_large_filename" FROM \`media\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`ALTER TABLE \`__new_media\` RENAME TO \`media\`;`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_thumb_sizes_thumb_filename_idx\` ON \`media\` (\`sizes_thumb_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_medium_sizes_medium_filename_idx\` ON \`media\` (\`sizes_medium_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_large_sizes_large_filename_idx\` ON \`media\` (\`sizes_large_filename\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`name\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`)
}
