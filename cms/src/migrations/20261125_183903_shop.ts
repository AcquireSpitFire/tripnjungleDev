import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`exhibitions_gallery_prints\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`material\` text,
  	\`details\` text,
  	\`pricing\` text NOT NULL,
  	\`price\` numeric,
  	\`copies\` numeric,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`exhibitions_gallery\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_prints_order_idx\` ON \`exhibitions_gallery_prints\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_gallery_prints_parent_id_idx\` ON \`exhibitions_gallery_prints\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`orders_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`photo_name\` text,
  	\`artist_name\` text,
  	\`exhibition_title\` text,
  	\`print_label\` text,
  	\`size\` text,
  	\`material\` text,
  	\`details\` text,
  	\`quantity\` numeric,
  	\`unit_price\` numeric,
  	\`line_total\` numeric,
  	\`exhibition_id\` integer,
  	\`exhibition_slug\` text,
  	\`media_id\` text,
  	\`print_id\` text,
  	FOREIGN KEY (\`exhibition_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`orders\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`orders_items_order_idx\` ON \`orders_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`orders_items_parent_id_idx\` ON \`orders_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_items_exhibition_idx\` ON \`orders_items\` (\`exhibition_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_items_print_id_idx\` ON \`orders_items\` (\`print_id\`);`)
  await db.run(sql`CREATE TABLE \`orders\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order_number\` text,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`tracking_number\` text,
  	\`tracking_url\` text,
  	\`notify_on_shipping\` integer DEFAULT true,
  	\`paid_at\` text,
  	\`shipped_at\` text,
  	\`expires_at\` text,
  	\`withdrawal_received_at\` text,
  	\`withdrawal_statement\` text,
  	\`internal_note\` text,
  	\`subtotal\` numeric,
  	\`shipping_cost\` numeric,
  	\`total\` numeric,
  	\`vat_note\` text,
  	\`vat_amount\` numeric,
  	\`shipping_zone\` text,
  	\`delivery_time\` text,
  	\`customer_name\` text,
  	\`customer_email\` text,
  	\`customer_phone\` text,
  	\`shipping_address_name\` text,
  	\`shipping_address_line1\` text,
  	\`shipping_address_line2\` text,
  	\`shipping_address_postal_code\` text,
  	\`shipping_address_city\` text,
  	\`shipping_address_state\` text,
  	\`shipping_address_country\` text,
  	\`billing_address_name\` text,
  	\`billing_address_line1\` text,
  	\`billing_address_line2\` text,
  	\`billing_address_postal_code\` text,
  	\`billing_address_city\` text,
  	\`billing_address_state\` text,
  	\`billing_address_country\` text,
  	\`stripe_session_id\` text,
  	\`stripe_payment_intent\` text,
  	\`confirmation_sent\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`orders_order_number_idx\` ON \`orders\` (\`order_number\`);`)
  await db.run(sql`CREATE INDEX \`orders_status_idx\` ON \`orders\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`orders_expires_at_idx\` ON \`orders\` (\`expires_at\`);`)
  await db.run(sql`CREATE INDEX \`orders_stripe_session_id_idx\` ON \`orders\` (\`stripe_session_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_updated_at_idx\` ON \`orders\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`orders_created_at_idx\` ON \`orders\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`price_requests\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'open' NOT NULL,
  	\`internal_note\` text,
  	\`name\` text,
  	\`email\` text NOT NULL,
  	\`message\` text,
  	\`photo_name\` text,
  	\`print_label\` text,
  	\`exhibition_title\` text,
  	\`photo_url\` text,
  	\`exhibition_id\` integer,
  	\`print_id\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`exhibition_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`price_requests_exhibition_idx\` ON \`price_requests\` (\`exhibition_id\`);`)
  await db.run(sql`CREATE INDEX \`price_requests_updated_at_idx\` ON \`price_requests\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`price_requests_created_at_idx\` ON \`price_requests\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_shipping_zones_countries\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` text NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`site_shipping_zones\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`site_shipping_zones_countries_order_idx\` ON \`site_shipping_zones_countries\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`site_shipping_zones_countries_parent_idx\` ON \`site_shipping_zones_countries\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_shipping_zones\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`price\` numeric NOT NULL,
  	\`free_from\` numeric,
  	\`delivery_time\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`site_shipping_zones_order_idx\` ON \`site_shipping_zones\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`site_shipping_zones_parent_id_idx\` ON \`site_shipping_zones\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`exhibitions\` ADD \`watermark_id\` integer REFERENCES media(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`exhibitions_watermark_idx\` ON \`exhibitions\` (\`watermark_id\`);`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`for_sale\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`watermark_key\` text;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`orders_id\` integer REFERENCES orders(id) ON DELETE CASCADE;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`price_requests_id\` integer REFERENCES price_requests(id) ON DELETE CASCADE;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_orders_id_idx\` ON \`payload_locked_documents_rels\` (\`orders_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_price_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`price_requests_id\`);`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`shop_enabled\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`shop_email\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`vat_mode\` text DEFAULT 'smallBusiness' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`vat_rate\` numeric DEFAULT 20;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`small_business_note\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`shop_note\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`watermark_image_id\` integer REFERENCES media(id) ON DELETE SET NULL;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`watermark_opacity\` numeric DEFAULT 18;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`watermark_size\` numeric DEFAULT 35;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`watermark_position\` text DEFAULT 'center';`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`terms_text\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`withdrawal_text\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`mail_provider_name\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`mail_provider_address\` text;`)
  await db.run(sql`CREATE INDEX \`site_watermark_image_idx\` ON \`site\` (\`watermark_image_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`exhibitions_gallery_prints\`;`)
  await db.run(sql`DROP TABLE \`orders_items\`;`)
  await db.run(sql`DROP TABLE \`orders\`;`)
  await db.run(sql`DROP TABLE \`price_requests\`;`)
  await db.run(sql`DROP TABLE \`site_shipping_zones_countries\`;`)
  await db.run(sql`DROP TABLE \`site_shipping_zones\`;`)
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
  	\`created_by_id\` integer,
  	\`updated_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`front_page_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_exhibitions\`("id", "slug", "title", "theme", "description", "release", "date", "time", "location", "visibility", "locked", "video", "front_page_id", "created_by_id", "updated_by_id", "updated_at", "created_at") SELECT "id", "slug", "title", "theme", "description", "release", "date", "time", "location", "visibility", "locked", "video", "front_page_id", "created_by_id", "updated_by_id", "updated_at", "created_at" FROM \`exhibitions\`;`)
  await db.run(sql`DROP TABLE \`exhibitions\`;`)
  await db.run(sql`ALTER TABLE \`__new_exhibitions\` RENAME TO \`exhibitions\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`exhibitions_slug_idx\` ON \`exhibitions\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_front_page_idx\` ON \`exhibitions\` (\`front_page_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_created_by_idx\` ON \`exhibitions\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_updated_by_idx\` ON \`exhibitions\` (\`updated_by_id\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_updated_at_idx\` ON \`exhibitions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`exhibitions_created_at_idx\` ON \`exhibitions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`exhibitions_id\` integer,
  	\`artists_id\` integer,
  	\`media_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`exhibitions_id\`) REFERENCES \`exhibitions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artists_id\`) REFERENCES \`artists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "exhibitions_id", "artists_id", "media_id", "users_id") SELECT "id", "order", "parent_id", "path", "exhibitions_id", "artists_id", "media_id", "users_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_exhibitions_id_idx\` ON \`payload_locked_documents_rels\` (\`exhibitions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_artists_id_idx\` ON \`payload_locked_documents_rels\` (\`artists_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_site\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`site_description\` text,
  	\`about_text\` text,
  	\`contact_email\` text,
  	\`jurisdiction\` text DEFAULT 'de' NOT NULL,
  	\`operator_name\` text,
  	\`operator_street\` text,
  	\`operator_city\` text,
  	\`operator_country\` text,
  	\`operator_email\` text,
  	\`operator_phone\` text,
  	\`business_purpose\` text DEFAULT 'Photo and video exhibitions',
  	\`legal_extra\` text,
  	\`responsible_person\` text,
  	\`imprint_extra\` text,
  	\`host_name\` text,
  	\`host_address\` text,
  	\`host_location\` text,
  	\`host_outside_eu\` integer DEFAULT false,
  	\`host_privacy_url\` text,
  	\`privacy_extra\` text,
  	\`qr_format\` text DEFAULT 'a6',
  	\`qr_show_title\` integer DEFAULT true,
  	\`qr_show_artist\` integer DEFAULT true,
  	\`qr_show_exhibition\` integer DEFAULT true,
  	\`qr_footer\` text DEFAULT 'Scan to view online',
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_site\`("id", "site_description", "about_text", "contact_email", "jurisdiction", "operator_name", "operator_street", "operator_city", "operator_country", "operator_email", "operator_phone", "business_purpose", "legal_extra", "responsible_person", "imprint_extra", "host_name", "host_address", "host_location", "host_outside_eu", "host_privacy_url", "privacy_extra", "qr_format", "qr_show_title", "qr_show_artist", "qr_show_exhibition", "qr_footer", "updated_at", "created_at") SELECT "id", "site_description", "about_text", "contact_email", "jurisdiction", "operator_name", "operator_street", "operator_city", "operator_country", "operator_email", "operator_phone", "business_purpose", "legal_extra", "responsible_person", "imprint_extra", "host_name", "host_address", "host_location", "host_outside_eu", "host_privacy_url", "privacy_extra", "qr_format", "qr_show_title", "qr_show_artist", "qr_show_exhibition", "qr_footer", "updated_at", "created_at" FROM \`site\`;`)
  await db.run(sql`DROP TABLE \`site\`;`)
  await db.run(sql`ALTER TABLE \`__new_site\` RENAME TO \`site\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`for_sale\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`watermark_key\`;`)
}
