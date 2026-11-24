import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// Release 2.0: artist profiles (credited on exhibitions and photos, page /artist/<slug>).
// Generated, then edited by hand: delete rules for the added references (as in the snapshot).

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`artists\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`portrait_id\` integer,
  	\`page_type\` text DEFAULT 'profile' NOT NULL,
  	\`external_url\` text,
  	\`short_text\` text,
  	\`website\` text,
  	\`instagram\` text,
  	\`contact_via\` text DEFAULT 'tripnjungle',
  	\`contact_email\` text,
  	\`contact_phone\` text,
  	\`contact_consent\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`portrait_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`artists_slug_idx\` ON \`artists\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`artists_portrait_idx\` ON \`artists\` (\`portrait_id\`);`)
  await db.run(sql`CREATE INDEX \`artists_updated_at_idx\` ON \`artists\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`artists_created_at_idx\` ON \`artists\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`exhibitions_gallery\` ADD \`artist_id\` integer REFERENCES artists(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_artist_idx\` ON \`exhibitions_gallery\` (\`artist_id\`);`)
  await db.run(sql`ALTER TABLE \`exhibitions_rels\` ADD \`artists_id\` integer REFERENCES artists(id) ON DELETE CASCADE;`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_artists_id_idx\` ON \`exhibitions_rels\` (\`artists_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`artist_id\` integer REFERENCES artists(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`users_artist_idx\` ON \`users\` (\`artist_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`artists_id\` integer REFERENCES artists(id) ON DELETE CASCADE;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_artists_id_idx\` ON \`payload_locked_documents_rels\` (\`artists_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`artists\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_exhibitions_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`file_id\` integer NOT NULL,
  	\`name\` text,
  	\`alt\` text,
  	FOREIGN KEY (\`file_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_exhibitions_gallery\`("_order", "_parent_id", "id", "file_id", "name", "alt") SELECT "_order", "_parent_id", "id", "file_id", "name", "alt" FROM \`exhibitions_gallery\`;`)
  await db.run(sql`DROP TABLE \`exhibitions_gallery\`;`)
  await db.run(sql`ALTER TABLE \`__new_exhibitions_gallery\` RENAME TO \`exhibitions_gallery\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_order_idx\` ON \`exhibitions_gallery\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_parent_id_idx\` ON \`exhibitions_gallery\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_file_idx\` ON \`exhibitions_gallery\` (\`file_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_exhibitions_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_exhibitions_rels\`("id", "order", "parent_id", "path", "media_id") SELECT "id", "order", "parent_id", "path", "media_id" FROM \`exhibitions_rels\`;`)
  await db.run(sql`DROP TABLE \`exhibitions_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_exhibitions_rels\` RENAME TO \`exhibitions_rels\`;`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_order_idx\` ON \`exhibitions_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_parent_idx\` ON \`exhibitions_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_path_idx\` ON \`exhibitions_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_rels_media_id_idx\` ON \`exhibitions_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`role\` text DEFAULT 'editor' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_users\`("id", "name", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until") SELECT "id", "name", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "reset_password_requested_at", "login_attempts", "lock_until" FROM \`users\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`exhibitions_id\` integer,
  	\`media_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`exhibitions_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "exhibitions_id", "media_id", "users_id") SELECT "id", "order", "parent_id", "path", "exhibitions_id", "media_id", "users_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_exhibitions_id_idx\` ON \`payload_locked_documents_rels\` (\`exhibitions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
}
