# LeaseWiz — Australian Novated Lease Explainer & Calculator

A Next.js app that explains how a novated lease actually works and models what one
would cost a particular person: the pre-tax and post-tax split of the salary
deduction, fringe benefits tax and the employee contribution method, the electric
vehicle exemption, packaged running costs, the residual, and a like-for-like
comparison against buying the same car with a car loan or with cash.

Everything is modelled in **today's dollars** on **FY2026-27** reference data, and
every rate is stored with a citation to its published source.

> General information only — not personal financial or tax advice. It does not
> consider your objectives, financial situation or needs, and recommends no lease,
> financier or vehicle. Your employer must agree to the arrangement, and a real
> quote will differ.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** · **Tailwind v4** · **Recharts**
- **PostgreSQL** via raw `pg` (no ORM); Next server actions
- Custom **scrypt** auth with DB-backed sessions (httpOnly cookie) + optional Google sign-in
- **Vitest**; results recorded to the DB and surfaced in the admin backoffice
- Deployed on **Railway** (Nixpacks); migrations run as a pre-deploy step

The design system follows the Atlassian Design System colour ramp — brand blue
`#0C66E4`, the N-series neutrals, and the G/Y/R semantic families. Tokens live in
one `@theme` block at the top of [`app/globals.css`](app/globals.css); nothing else
hard-codes a colour.

## Getting started

Prerequisites: Node 22, PostgreSQL.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` (gitignored):
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/novated
   # Optional — enables "Continue with Google" (omit and the button is hidden):
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   ```
   For Google sign-in, create an **OAuth 2.0 Client ID** (type: *Web application*)
   in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   and add these **Authorized redirect URIs**:
   `http://localhost:3000/api/auth/google/callback` (dev) and
   `https://YOUR_DOMAIN/api/auth/google/callback` (prod). The redirect URI is
   derived from the request host, so no base-URL env var is needed.
3. Create the schema and seed reference data (idempotent — safe to re-run):
   ```bash
   npm run db:migrate
   ```
4. (Optional) Promote a user to admin for the backoffice:
   ```bash
   node scripts/make-admin.mjs you@example.com
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server on :3000 (frees the port first) |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply the schema and seed reference data / sources |
| `npm test` | Run the Vitest suite |
| `npm run test:record` | Run the suite and record results to the DB for `/admin/tests` |
| `npm run sanity` | Print engine output for a spread of scenarios — eyeball a rate change |
| `node scripts/make-admin.mjs <email>` | Grant admin rights |
| `node --env-file=.env.local scripts/dev-login.mjs --admin` | Mint a local session token for browser testing |

## How the lease engine works

[`lib/au/novated.ts`](lib/au/novated.ts) is the whole model. The shape of it:

1. **Finance** — the financier buys the car and claims the GST credit (capped at the
   car limit), so the lease is written over the GST-exclusive amount. Level monthly
   payments amortise down to a residual, which defaults to the ATO minimum for the
   term (IT 2509).
2. **Running costs** — fuel or charging, servicing, tyres, registration, insurance
   and roadside, benchmarked to the kilometres driven and budgeted **ex-GST**
   (the employer claims the credit). Any component can be overridden with a real quote.
3. **FBT** — the statutory formula puts the taxable value at 20% of the car's
   GST-inclusive price. That is then either exempt (eligible battery-electric vehicle
   under the LCT fuel-efficient threshold), cancelled by an employee contribution paid
   from post-tax salary (ECM), or paid by the employer as a grossed-up bill.
4. **The package** — everything except the employee contribution comes out of pre-tax
   salary. The tax relief is **measured, not assumed**: the model computes the whole
   tax position with and without the deduction and takes the difference, so bracket
   crossings, the LITO taper, the Medicare shade-in and HELP steps are all handled.
5. **Comparison** — the lease, a car loan and a cash purchase, all funding the same
   car over the same term and all leaving the same residual owing.

### The two things that are easy to get wrong

- **Reportable fringe benefits.** An FBT-exempt EV still produces a reportable amount
  on the payment summary. It is not taxable income, but it counts towards HELP
  repayment income and other income tests — so it belongs on the *packaged* side of
  the before/after comparison only. Applying it to both sides invents a saving that
  nobody gets. See `marginalRelief` in [`lib/au/tax.ts`](lib/au/tax.ts).
- **The residual.** It is a real obligation, not a formality, and it is excluded from
  the term cost deliberately — every comparison leaves the same amount owing, so the
  columns stay honest.

## Reference data

No rate is hard-coded in a page. [`lib/au/config.ts`](lib/au/config.ts) holds the code
defaults for one financial year; on first migrate they are seeded into
`ref_data_versions` as the active version. From then on the **active** version in the
database is what the engine runs on, and it is edited in the admin backoffice at
`/admin` — every edit and verification is written to an audit log.

- [`lib/au/params.ts`](lib/au/params.ts) flattens the nested config into an editable,
  auditable list — each parameter knows its label, unit, dot-path and source.
- [`lib/au/sources.ts`](lib/au/sources.ts) declares the sources as first-class records
  (the ATO page a rate came from, how often it changes, when we last checked it).
  `/admin/review` lists everything overdue.
- Parameters that move often (indexed thresholds, market-sampled fees) are seeded
  flagged for verification, so they show up in the review digest until signed off.

Rolling to a new financial year: `/admin` → **Roll forward next FY**, then verify each
parameter against its source.

## The vehicle catalogue

The same seed-then-own pattern, one table over. [`lib/au/vehicles.ts`](lib/au/vehicles.ts)
is the code catalogue: it fills the `vehicles` table on every migrate and is the fixture
the tests run against. What the picker actually reads is the table, via
[`lib/catalogue.ts`](lib/catalogue.ts), so a car can be added or a spec corrected at
`/admin/vehicles` without a release.

The two stay out of each other's way through one column. Any admin write sets
`edited`, and the deploy seed skips a row that carries it — otherwise the next release
would silently undo the correction. **Revert to catalogue** puts a row back under the
seed's control.

- The catalogue deliberately carries **no price**. The same model varies by thousands
  between dealers, so the drive-away figure stays something the user reads off their
  own quote.
- `consumption` is the combined-cycle figure — kWh/100km for a battery-electric car,
  L/100km for everything else. It drives the fuel budget, so `validateVehicle` refuses
  a figure outside the plausible range for the fuel type: a petrol car's 7.4 entered
  against "electric" would otherwise halve the budget with nothing looking wrong.
- Artwork is bytes in the same row, served by `/api/vehicle-image/[id]`. It is never
  seeded, so a revert leaves it alone. Anything without one shows
  `public/vehicle-placeholder.jpg` — a car under a cover, which reads as a real car
  awaiting reveal rather than as a missing asset. If that file is absent the display
  drops again to a drawn silhouette (`components/CarProfile.tsx`), so the catalogue
  never shows a broken frame.
- Generation prompts come from [`lib/au/vehicleImagePrompt.ts`](lib/au/vehicleImagePrompt.ts):
  one template for the whole set, shown per-vehicle in the editor and written out for
  the code catalogue by `npx tsx scripts/gen-image-prompts.ts`.
- A vehicle a saved lease names is **hidden, never deleted** — the id lives in that
  lease, and the car at the top of someone's page should not vanish.

## Lease providers

A directory, not reference data — nothing in the engine reads it. It exists so the
same company is not typed fourteen different ways in the decoder's "who quoted it"
box, which is a combobox over `providers` rather than a plain text field.

- **Anyone can add one.** The person holding a quote from a provider we have never
  heard of is exactly who we want to hear from. What they add lands as `pending` and
  is suggested to nobody until an admin approves it at `/admin/providers`, so an open
  write cannot put text in front of other users.
- **`slug` is the dedupe key** ([`lib/au/providers.ts`](lib/au/providers.ts)): case,
  punctuation, accents, initialisms and the usual corporate tail are normalised away,
  so "Maxxia", "maxxia" and "Maxxia Pty Ltd" are one row. It is unique, which makes a
  resubmission an upsert rather than a duplicate — and means a rejected name cannot be
  resurrected by typing it again.
- **A quote stores the name its owner typed**, as free text. The directory only
  supplies suggestions, so moderating it — approving, renaming, merging, deleting —
  never changes anyone's saved work.
- Merging is for the duplicates the slug cannot catch: "Smart Leasing" and
  "Smartleasing" are two keys but one company, and only a person can tell.

`PROVIDER_SEEDS` is a starting point, not a claim to be complete or current. Trading
names change and companies rebrand; the list is editable at `/admin/providers` and is
expected to be reviewed there.

## Layout

```
app/                     routes (App Router)
  actions/               server actions — auth, plans, admin, tracking, feedback
  admin/                 the backoffice (parameters, sources, review, tests, users, …)
  api/                   health, version, Google OAuth, the share-link JSON twin
components/              UI — LeaseCalculator is the main surface
lib/
  au/                    the domain: config, params, sources, tax, novated (the engine)
  auth.ts, db.ts         sessions, scrypt hashing, the pg pool
  migrations.ts          the whole schema + idempotent seeds, in one file
scripts/                 migrate, seed, test recorder, version stamp, dev helpers
tests/                   Vitest — engine, tax, FBT, reference-data integrity, SEO
```

## Testing

`npm test` runs the suite. `npm run test:record` runs it and writes each result to
`test_runs` / `test_results`, which `/admin/tests` renders — so the health of the
engine is visible in the product, not just in CI. The top-level `describe()` title
becomes the "area" in that dashboard, so name it after the business area it covers.

`tests/reference-data.test.ts` is the guard that matters most: it checks every
parameter descriptor resolves to a real number, cites a real source, and sits in a
declared category — so a config refactor cannot silently orphan a rate.

## Deploying

Railway builds with Nixpacks and runs `npm run db:migrate` as a pre-deploy command, so
the schema and seeds are applied before the new version serves traffic. A failed
migration exits non-zero and aborts the deploy. `/api/health` is the healthcheck.

Set `NEXT_PUBLIC_SITE_URL` to the live domain; it drives canonicals, the sitemap and
OG cards.
