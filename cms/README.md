# Tripnjungle CMS

Payload 3 (admin + REST API) with SQLite; Next.js serves the frontend. The site starts empty:
all exhibitions, posters, photos and videos come from the admin panel.

## Running locally

```
cd cms
cp .env.example .env        # fill in PAYLOAD_SECRET
npm install
npm run dev
```

- Frontend: http://localhost:3000/
- Admin: http://localhost:3000/admin (create the admin user on the first visit)

## Managing content

In the admin under **Exhibitions**:

- New exhibition: ID (becomes part of the URL, e.g. `brasil-1` → `/exhibition/brasil-1`), title, theme,
  description, date, time, location, intro video (YouTube), posters, cover, images and videos.
- Add, reorder (drag & drop) or remove photos/videos/posters at any time.
- **Several photos at once**: in the field “Add several photos at once” choose “Create New”, drop all
  files together (10, 20 or more) and save without adding rows. After saving the exhibition they appear
  as new rows at the end of “Images and videos”. Images without a name are shown without a caption.
- **Release**:
  - *Date*: listed under Events, in the Archive after the date.
  - *Coming soon*: no date, always at the end of the events and the posters on the home page.
  - *Planning*: already created and uploaded, but not visible to visitors anywhere (posters neither).
- **Visibility**:
  - *Locked* (default): posters and details are public (Events, home page), the exhibition itself is
    not; its files cannot be fetched.
  - *Locked with link*: like locked, but whoever knows the address `/exhibition/<ID>` sees the
    exhibition. It is missing from the slideshow, the Exhibitions list and the sitemap and is not indexed.
    No password protection: the ID can be guessed, so only use it for uncritical previews.
  - *Public*: visible to everyone, also in the slideshow, the Exhibitions list and the sitemap.
- Images are stored in three WebP sizes on upload (600/1280/2560 px); the original is kept.
- Allowed file types: JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, MOV. No SVG, no HEIC
  (export iPhone photos as JPEG first).
- **Preview**: the sidebar of an exhibition has “Preview (with your login)”. It opens the exhibition with
  your account and also shows locked and planned content (marked as preview). Everywhere else the site
  looks exactly like it does for visitors, even when you are logged in.
- **Photo pages**: every photo has its own page `/exhibition/<ID>/photo/<photo ID>` (large photo, name,
  artist, previous/next). Same visibility as the exhibition: with *Locked* it says “not available yet”.

## Accounts and roles

Accounts are managed by admins under **Accounts**. Everybody changes their own name and password via
the avatar (top right). An admin sets the first password and tells the person; they change it after
logging in. “Forgot password” on the login page sends a reset link once e-mail is set up (`SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`; without them e-mails only appear in the log). Passwords need at least 12 characters; 5 wrong attempts lock the account for 15 minutes.

**Log out**: in the admin with the “Log out” button (top right, next to the account name and role);
on the website, logged-in accounts find “Admin” and “Log out” at the end of the menu. Logging out
ends the session on the server, not only in the browser.

| Role | May |
|---|---|
| **Admin** | Everything: accounts, site settings, all sections. The very first account always becomes admin. |
| **Manager** | Everything in the sections ticked under “Sections” (one manager account per sub page; today: Exhibitions). No accounts, no site settings. |
| **Artist** | Linked to an artist profile (“Artist profile”). Creates exhibitions (always *Planning* + *Locked*, credited to the own profile), edits the exhibitions that credit the profile and the profile itself. Cannot publish, delete or change IDs. |
| **Editor** | Edits the content of the exhibitions they are assigned to (texts, captions, alt texts, photos and their order). Cannot publish, create, delete or change IDs. |

- Only admins change roles, also not on their own account. The last admin cannot be deleted or demoted.
- **Assign an editor**: in the exhibition, sidebar → **Editors** (managers and admins only).
- Artists and editors only see their own exhibitions, the media of those and their own uploads.
- Artists and editors can only **add** photos that are public already or that they uploaded themselves
  (as poster, cover, gallery item or portrait). Other locked photos need a manager – otherwise they
  could publish a photo a manager keeps locked.
- Their own uploads can be changed or deleted only while they are still locked; once a photo is public,
  only managers change it.
- “Created by” / “Last changed by” in the sidebar show who did what; visitors never see account details.

## Artists

Under **Artists**: name, ID (URL), portrait and the kind of artist page `/artist/<ID>`:

- *Mini page on Tripnjungle*: portrait, short text, website/Instagram, contact and the public exhibitions.
  Contact either **via Tripnjungle** (contact e-mail of the Site settings) or the **artist's own details**;
  those are only published when “The artist agreed to publish these contact details” is ticked.
- *Link to the artist's own website*: `/artist/<ID>` forwards there.

Exhibitions credit artists under **Artists** (“by …” with a link, “About the artist” below the gallery).
A single photo by someone else gets its own **Artist of this photo** in its row.

## QR codes

Every photo has a QR code in its row under “Images and videos” (after saving the exhibition):
**Copy QR image**, **Copy link** and **Download PDF** (printable label). The sidebar has
**All QR codes as PDF** (one label per page). Size (A6, A5, 10 × 10 cm) and texts: **Site settings → QR codes**.

- The code contains the short link `https://your-domain.com/p/<photo ID>`, which forwards to the photo
  page. Printed codes keep working when addresses change later.
- **Before printing**: `PAYLOAD_PUBLIC_SERVER_URL` must be the real domain (the admin warns while it is
  `localhost` or a Railway address), and the exhibition must be *Locked with link* or *Public* by the
  time visitors scan – otherwise the page says “not available yet”.

## Security notes

- **Login**: at most 10 login/password requests per IP address in 15 minutes (`src/proxy.ts`, then
  “429 Too Many Requests”), plus Payload's lock of 15 minutes after 5 wrong passwords per account.
  Sessions are stored on the server (logging out ends them), cookies are `httpOnly`, `SameSite=Strict`
  and `secure` on https.
- **Startup**: the server refuses to start with a `PAYLOAD_SECRET` shorter than 32 characters
  (`openssl rand -hex 32` gives 64) and warns in production without `PAYLOAD_PUBLIC_SERVER_URL`.
- **Photos**: visitors only get the generated WebP sizes. Original photos (with camera data such as
  GPS position and time) are only delivered to logged-in accounts. Locked media are never delivered
  to visitors; `/api/media` itself is not public (the site gets media through exhibitions/artists).
- **Caching**: media files are only cached by the browser (`private`, one week), never by shared
  caches, because what may be delivered depends on the login. Pages are cached publicly and never
  contain anything account-specific.
- **“Locked with link”**: lists (`/api/exhibitions`) show such exhibitions like locked ones (poster and
  details); the content only comes with a lookup of exactly that ID.
- **API limits**: visitors, artists and editors get at most 100 results per request; `depth` is at most 2.
- **Uploads**: only JPEG, PNG, WebP, AVIF, GIF, MP4, WebM and QuickTime (checked from the file content,
  no SVG); files are served with a sandbox CSP.
- `npm run test:access` checks all of this against a temporary database.

Accepted on purpose (known, low risk):

- **Artist redirect**: an artist account with *Link to the artist's own website* chooses the target
  itself, so `/artist/<ID>` can forward to any https address. All artist accounts are known personally
  and their pages are checked.
- `npm audit` reports 5 moderate findings in esbuild inside `drizzle-kit` (development tool of the
  SQLite adapter; no fix available, do **not** run `npm audit fix --force`). They disappear with a
  Payload update that ships a newer drizzle-kit.
- `/p/<photo ID>` reveals which exhibition (ID) a photo belongs to; exhibition IDs are public anyway.
- Videos keep their metadata (removing it needs ffmpeg).
- On a completely empty database, the first account created becomes admin – create it right after
  the first deploy.
- The login rate limit counts per server process; with several instances it multiplies.

## Site settings (About, legal notice, privacy)

In the admin under **Site settings** (globals); fill in everything before going live:

- **About**: site description for search engines, About text (blank line = paragraph), contact e-mail.
- **Legal notice**: country (Germany/Austria, controls the legal references), name, address,
  e-mail, phone, legal form/register/VAT ID if applicable, person responsible under § 18 MStV (Germany only).
- **Privacy**: hosting provider (name, address, server location, based outside the EU yes/no, link to
  its privacy policy), optional additional text.

The pages `/imprint` and `/privacy` are generated from it; they are linked in the footer of every page.
Missing details are highlighted in yellow on the page so nothing goes live empty.

**YouTube consent:** videos are only loaded after a click on “Play video” (notice card with a link to the
privacy policy, two-click solution). The decision is remembered in the browser; only then is the YouTube
API preloaded in the background. `/privacy` has a button to reset it. That is why the site needs no cookie
banner: YouTube is the only third party, the admin cookie is technically necessary.

## Hosting (Railway)

One-time setup, about an hour. Everything else happens in the admin afterwards.

1. Commit everything and push it to GitHub (`.env`, `*.db` and `media/` stay out via .gitignore).
2. Sign in at railway.com, **New Project → Deploy from GitHub repo**, pick this repo.
3. In the service under **Settings**:
   - **Root Directory: `cms`** (otherwise Railway finds no package.json)
   - **Region: Europe** (Amsterdam). The data then stays in the EU.
   - Build and start come from `cms/railway.json` (`npm run build`, `npm start`, health check `/robots.txt`).
4. Create a **volume** (right-click the service → Attach Volume), mount path **`/data`**.
   Database and media live there; without a volume everything is gone after every deploy.
5. Under **Variables** set:
   - `PAYLOAD_SECRET` – long random string, e.g. from `openssl rand -hex 32`; never share it
   - `DATABASE_URI=file:/data/tripnjungle.db`
   - `MEDIA_DIR=/data/media`
   - `PAYLOAD_PUBLIC_SERVER_URL=https://your-domain.com` (no trailing slash; until the domain is set up,
     use the `https://….up.railway.app` address generated by Railway)
6. **Settings → Networking → Custom Domain**: enter the domain and set the CNAME shown at your registrar.
   Railway sets up HTTPS automatically. Then change `PAYLOAD_PUBLIC_SERVER_URL` to the domain
   (triggers a restart).
7. Right after the first successful deploy, open `https://your-domain.com/admin` **immediately** and
   create the admin user. Whoever does that first is admin (the first account always gets the role
   admin). Use a strong password (at least 12 characters).
8. Fill in the **Site settings**. For the privacy policy under Privacy:
   - Hosting provider: `Railway Corporation`, address as in the imprint/terms on railway.com
   - Server location: `Amsterdam, Netherlands (EU)`
   - **Tick “outside the EU/EEA”** (US company, even though the server is in the EU)
   - Link to Railway's privacy policy (railway.com/legal/privacy)
   - Accept or file Railway's data processing agreement (DPA) under railway.com/legal.
9. Check: home page, `/robots.txt` and `/sitemap.xml` show the domain, `/imprint` and `/privacy`
   without yellow highlights, upload a test poster, test the video notice and the player.
10. Register the domain in Google Search Console and submit the sitemap `https://your-domain.com/sitemap.xml`.

Every further push to the connected branch triggers a build and deploy automatically. `npm start` first
runs the database migrations (`src/migrations`) and then starts the server.

**Updating to release 2.0** (accounts, artists, QR codes): download a backup of `tripnjungle.db` first.
The migrations run on the next start: field names become English (data is kept), all existing accounts
become admins, artists/editors/QR settings are added. Then set `PAYLOAD_PUBLIC_SERVER_URL` to the real
domain before printing any QR code, and create the manager/artist/editor accounts under Accounts.

**Backup:** Railway does not keep permanent volume backups automatically. Daily snapshots can be enabled
under Volume → Backups (paid). In addition, download `tripnjungle.db` and `media/` from the volume now
and then (Railway CLI: `railway ssh` or volume download).

**Cost:** Hobby plan about 5 USD/month including credit; the site uses little of it.

For your own server (VPS) the same applies: Node 24, `.env` as above, `npm ci && npm run build`,
`npm start` under PM2/systemd, Caddy or nginx as HTTPS proxy in front.

## Changing the schema

After changes to the collections: `npm run migrate:create` creates a new migration in
`src/migrations`; it runs automatically on the next `npm start`. Locally (`npm run dev`) the schema is
adjusted directly.

**Renames** (a field or array gets a new name): `migrate:create` asks in the terminal whether a table or
column was renamed or newly created and cannot run without an interactive terminal; if it treats it as
new, the data is lost. In that case write the migration by hand with `ALTER TABLE … RENAME …` and create
the schema snapshot with
`PAYLOAD_MIGRATING=true npx tsx --env-file=.env scripts/write-schema-snapshot.ts <yyyymmdd_hhmmss_name>`
(example: `src/migrations/20261122_230000_english_field_names.ts`). Back up the database first and test
the migration on a copy.

**Check:** `npm run migrate:create` adds references to other collections (e.g. `created_by_id`) without
their delete rule; add `ON DELETE SET NULL` (single reference) or `ON DELETE CASCADE` (`*_rels` tables) by
hand as in the generated `.json` snapshot, see the migrations of release 2.0.

**Permissions:** `npm run test:access` checks the roles (accounts, exhibitions, media, artists, editors,
QR codes, the security rules above) against a temporary database. Run it after every change to access rules.

## Files

- `src/access/roles.ts` – roles and all permission helpers
- `src/proxy.ts` – rate limit for login and password requests
- `src/lib/query-limits.ts` – page-size cap for visitors, artists and editors
- `src/collections/Exhibitions.ts` – fields, access, artists/editors, hooks
- `src/collections/Media.ts` – uploads (`MEDIA_DIR`), image sizes, public only with `locked: false`
- `src/collections/Artists.ts` – artist profiles; `src/app/artist/[slug]/route.ts` – the artist page
- `src/collections/Users.ts` – accounts, roles, login security
- `src/lib/media-lock.ts` – keeps `locked` of the media in sync with exhibitions and portraits
- `src/lib/qr.ts`, `src/endpoints/exhibition-qr.ts` – QR PNG/PDF; `src/components/QrCodeField.tsx`,
  `ExhibitionQrCodes.tsx` – the QR buttons in the admin; `src/app/p/[id]/route.ts` – short link
- `src/globals/Site.ts` – Site settings (About, legal notice, privacy); `src/lib/site.ts` prepares them for the templates
- `src/templates/*.html` – the pages; `src/app/**/route.ts` serves them with title, description,
  Open Graph and JSON-LD (`/`, `/exhibitions`, `/events`, `/archive`, `/about`, `/imprint`, `/privacy`,
  `/exhibition/<id>`, `/exhibition/<id>/photo/<photo id>`, `/artist/<id>`)
- `src/app/sitemap.xml`, `src/app/robots.txt` – SEO
- `src/migrations/` – database migrations for production
- `public/` – CSS, JS, favicon, OG image; `public/js/data.js` talks to the API and picks the image size
- `scripts/regenerate-sizes.ts` – regenerate image sizes for existing media (`npm run media:regenerate -- --yes`; without `--yes` it only shows which database and folder it would change)
- `scripts/set-locked.ts` – lock/unlock an exhibition from the command line (for testing; needs `--yes`)
- `scripts/write-schema-snapshot.ts` – schema snapshot for hand-written migrations (see above)
- `scripts/check-access.ts` – permission checks (`npm run test:access`)
- `tripnjungle.db`, `media/`, `.env` – local, not in git
