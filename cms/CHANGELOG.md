# Changelog

What changed in each release and what to do when updating a running site. Before every update:
**download a backup of `tripnjungle.db` and `media/`** from the volume (see README → Hosting). Railway
runs the database migrations automatically when the new version starts (`npm start`).

## Release 3.0 – prints shop, security and clean-up

### Shop

- Prints of the photos are sold in the exhibitions: per photo *No price* (nothing shown), *Fixed price*
  (“Add to cart”) or *Price on request* (form); size, material, details and copies left.
- Cart (`/cart`), Stripe Checkout, Stripe webhook, orders and price requests in the admin (section
  *Shop*), e-mails over SMTP (Nodemailer), terms (`/terms`), instructions on withdrawal and the
  withdrawal function (`/withdrawal`).
- Photos for sale get a watermark (site-wide or per exhibition) burned into the web images.
- Shop status in Site settings → Shop, and the preview of prints while the shop is closed.

### Accounts

- Contributor terms: every account except admins accepts them on its account page before uploading or
  changing anything; every upload needs “Rights confirmed”.
- Accounts are no longer locked after wrong passwords; the login is limited per address and account.

### Security

- Rate limits count encoded paths too, IPv6 per /64, with an upper bound in memory; login limits per
  address + account, per address and per account; “Forgot password” 3 per account and hour.
- The upload proof (uploader's e-mail) is no longer part of the public API; small images are saved
  without camera metadata; upload by URL, `/api/og` and Next's image optimizer are off.
- At most 2 running checkouts with limited copies per connection; going back from Stripe frees the
  copies at once; artists/editors cannot move prints to another photo or replace a watermark image.

### SEO and legal

- Exhibition titles and the navigation are in the HTML; photo pages are linked from the gallery and
  carry ImageObject / Product data; sitemap with images and without limit; robots.txt opens the data
  the pages need.
- The shop needs e-mail sending; product safety details (GPSR); “Withdraw from contract here” on every
  page and without JavaScript; import duties notice outside the EU; DSA contact point and “Report this
  content”; privacy policy and contributor terms extended; slideshow pause button.

### For developers

- Shared building blocks (`src/lib/site-identity.ts`, `http.ts`, `slug.ts`, `text.ts`, `page.ts`,
  `src/fields/`), named hooks, Site settings and collections split into folders, template partials,
  browser scripts split by topic with shared slideshow and viewer, checks split per area
  (`scripts/access/`), Prettier, [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRIBUTING.md](CONTRIBUTING.md).

### Updating to 3.0

1. Backup first (see above). The migrations add the shop tables and fields, the checkout key and the
   product safety fields, and remove the account lock columns (`login_attempts`, `lock_until`).
2. Set the new server variables (Railway → Variables): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME` – see README →
   Shop. **The shop stays closed without e-mail sending.**
3. Every account except admins has to accept the contributor terms (again) on its account page.
4. Site settings: check the legal notice (Austria: the business purpose should name the sale of prints),
   Shop → product safety, shipping zones, VAT, e-mail provider; Privacy → hosting. The shop status at
   the top of the Shop tab lists what is missing.
5. Locally, the next `npm run dev` asks once whether to drop `login_attempts` / `lock_until` – answer
   **y**. If it fails with “index … already exists”, run `npm run db:repair-dev` (see CONTRIBUTING.md).
6. Watermarked copies are made on demand in `MEDIA_DIR/watermarked/` (can be deleted at any time).

## Release 2.0 – accounts, artists, QR codes

- Roles: admin, manager (per section), artist, editor; accounts managed by admins.
- Artist profiles with mini pages (`/artist/<id>`) and credits in exhibitions and photos.
- Editors per exhibition.
- Photo pages (`/exhibition/<id>/photo/<photo id>`), short links `/p/<id>` and printable QR labels.
- Log out button in the admin and on the website.
- Security: media only public through a public exhibition, originals only for logged-in accounts,
  login rate limit, query size limits, password rule, startup checks.

### Updating to 2.0

The migrations run on the next start: field names become English (data is kept), all existing accounts
become admins, artists/editors/QR settings are added. Then set `PAYLOAD_PUBLIC_SERVER_URL` to the real
domain before printing any QR code, and create the manager/artist/editor accounts under Accounts.

## Release 1.0 – the gallery

- Exhibitions with posters, cover, gallery (images and videos) and an intro video (YouTube after
  consent); home page slideshow, Exhibitions, Events, Archive, About, legal notice, privacy policy.
- Payload CMS with SQLite, three image sizes per upload, bulk upload, alt texts, visibility
  (locked / locked with link / public) and release (date / coming soon / planning).
- SEO: titles, descriptions, Open Graph, JSON-LD, sitemap.
