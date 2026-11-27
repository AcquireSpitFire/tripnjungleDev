# Contributing

How to work on Tripnjungle without breaking it. Start with [ARCHITECTURE.md](ARCHITECTURE.md) for the
big picture; [README.md](README.md) explains running and operating the site.

## Setup

Node `^22.23.4` or `>=24.22.1` (see `package.json` → `engines`).

```
cd cms
cp .env.example .env     # PAYLOAD_SECRET: openssl rand -hex 32
npm install
npm run dev              # http://localhost:3000, admin at /admin (the first account becomes admin)
```

Only one `next dev` per folder can run at a time. For a second server (e.g. to test with a copy of the
database) use a production build: `npm run build`, then
`DATABASE_URI=file:/path/to/copy.db npx next start -p 3006`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | development server; pushes schema changes into the local database automatically |
| `npm run test:access` | all checks (access rules, shop, watermark, SEO, legal) against a **temporary** database |
| `npm run build` | production build – run it before every commit that touches `src/` or `next.config.ts` |
| `npx tsc --noEmit` | type check |
| `npm run format` / `format:check` | Prettier over `src`, `scripts`, `public/js` |
| `npm run generate:types` | `src/payload-types.ts` after a field change |
| `npm run generate:importmap` | after adding or moving an admin component |
| `npm run migrate:create -- <name>` | a migration after a schema change (production uses only migrations) |
| `npm run db:repair-dev` | repairs a local database whose dev push fails (preview; `-- --yes` to repair) |

## Security checklist

Security comes first. Before every change, go through this list:

- **Access only through `src/access/roles.ts`.** Never check roles by hand in a hook or route. A new
  collection or field gets `access` (collection and, where needed, field level).
- **Server-only values** (lock flags, keys, proofs, order snapshots) use `serverOnly` /
  `hiddenServerOnly` from `src/fields/server-only.ts` and are written with `overrideAccess: true` by the
  server only.
- **Pages load data as a visitor**: `findPublicExhibitions` (never `overrideAccess: true` for page
  content). What is not public must not reach the HTML – not even an image address.
- **Templates**: `{{value}}` is escaped. `{{{value}}}` is raw HTML and only for HTML the server built
  itself with `escapeHtml` for every inserted value – never for text from a visitor or the admin.
- **Form routes** of the shop use `shopPost` (`src/lib/shop/route.ts`): same origin and a small JSON
  body are checked there. Other POST routes check `isSameOrigin` themselves.
- **Rate limits**: a new endpoint that sends e-mails, holds stock or checks secrets gets a limit in
  `src/proxy.ts`.
- **Uploads**: only the MIME types in `src/collections/Media.ts`; never SVG.
- **No secrets in the code or the repository**: everything secret comes from `.env` / Railway variables.
- **Every rule gets a check** in `scripts/access/` (positive and negative: "may" and "may not").

## Changing the schema

1. Change the collection/global, then `npm run generate:types`.
2. `npm run migrate:create -- <short_name>` and **read the generated SQL**. A rebuild of a whole
   table (`CREATE TABLE __new_…`) is a warning sign – see below.
3. Test the migration on an empty database and on a copy of a real one:
   `DATABASE_URI=file:/tmp/fresh.db npm run migrate`.
4. Commit the migration (`.ts` and `.json`) together with the change.

**Known trap (drizzle-kit, SQLite):** adding a **relationship** (a column with a foreign key) to an
**existing** table, or changing a column default, makes the local dev push rebuild the table and fail
later with "index … already exists". Prefer text/number/checkbox fields or a new table. If it happened,
`npm run db:repair-dev` fixes the local database (it makes a backup first and checks row counts and
foreign keys). Production is not affected: it only runs migrations (`npm start`).

When a migration drops a column, the next local `npm run dev` asks whether to accept it – answer
**y** after reading what it drops.

**Renames** (a field or array gets a new name): `migrate:create` asks in the terminal whether a table or
column was renamed or newly created and cannot run without an interactive terminal; if it treats it as
new, the data is lost. In that case write the migration by hand with `ALTER TABLE … RENAME …` and create
the schema snapshot with
`PAYLOAD_MIGRATING=true npx tsx --env-file=.env scripts/write-schema-snapshot.ts <yyyymmdd_hhmmss_name>`
(example: `src/migrations/20261122_230000_english_field_names.ts`).

**Delete rules:** `migrate:create` adds references to other collections (e.g. `created_by_id`) without
their delete rule; add `ON DELETE SET NULL` (single reference) or `ON DELETE CASCADE` (`*_rels` tables) by
hand as in the generated `.json` snapshot (see the migrations of release 2.0 and `20261125_183903_shop`).

## Code conventions

- **English** everywhere: code, comments, admin labels, docs.
- **Comments say why**, not what. Every file starts with a short comment on its job.
- **Named functions** for hooks (`src/collections/*/hooks.ts`), one job each; list them in the order
  they run.
- **Shared helpers instead of copies**: `serverUrl()` / `SITE_NAME` (`src/lib/site-identity.ts`),
  `json` / `errorJson` / `isSameOrigin` (`src/lib/http.ts`), `isSlug` (`src/lib/slug.ts`), text helpers
  (`src/lib/text.ts`), page values (`src/lib/page.ts`).
- **Browser scripts** are classic scripts (no modules, no build step) sharing globals. Start every file
  with `Needs:` / `Provides:`; keep the load order of `src/templates/partials/scripts.html`. They use
  semicolons and double quotes (Prettier keeps that via an override).
- **Formatting**: Prettier (`npm run format`); line endings stay as they are (Windows working copies
  use CRLF, the repository LF).

## Tests

`npm run test:access` runs `scripts/check-access.ts`, which runs the areas in `scripts/access/` in
order against a temporary database. Each area is `export async function check…(t)`:

- `t.check(name, condition, detail?)` and `t.fails(name, action)` record ✓/✗.
- `t.file()` makes a small PNG upload, `t.as(user)` runs the Local API as that account.
- Test data an area creates for later areas goes into `t.f` (`Object.assign(t.f, { … })`); later
  areas read it with `const { … } = t.f`.

Add a new area as its own file and register it in `scripts/check-access.ts`. A check must fail when
the rule is broken – try it once by breaking the rule on purpose.

For pages, also look at them in a real browser (production build, headless Edge/Chrome or your own):
no script errors in the console, slideshow, fullscreen view, cart, withdrawal form.

## Dependencies

- **Ask before adding a package or an external service.** Every dependency is code that runs with full
  rights.
- `npm audit` currently reports 5 moderate findings in esbuild inside `drizzle-kit` (a development tool
  of the SQLite adapter; no fix available). Do **not** run `npm audit fix --force`: it may install
  breaking versions of other packages.
- Update Payload packages together (`payload`, `@payloadcms/*`) to the same version.

## Commits

- Small, focused commits with a clear subject: `Area: what changed` (e.g. `Security: …`, `Shop: …`,
  `Refactor: …`, `Docs: …`). The body says why and lists behaviour changes.
- Before committing: `npx tsc --noEmit`, `npm run test:access` ("All checks passed."), `npm run build`,
  `npm run format:check`.
- Never commit `.env`, databases (`*.db`) or `media/`.
