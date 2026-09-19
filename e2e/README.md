# End-to-end specs

Browser tests that run against a **deployed** site, not a dev server.

```bash
npm run e2e              # headless
npm run e2e -- --headed  # watch it happen, slowed down
```

## Why these exist separately from `npm test`

The vitest suite covers the engine and the pure model, and it is where almost
everything belongs — it runs in five seconds and needs nothing but node. These
specs cover the handful of things a unit test structurally cannot see:

- that a page is served correctly by the real deployment, through Cloudflare
- that the client bundle hydrates and a button does what it claims
- that state surviving a hop between two routes actually survives it
- that a field stripped server-side is genuinely absent from the delivered bytes

The last one is the reason the share spec seeds a salary of `123456`. Reasoning
about where a field is stripped proves nothing. Searching the HTML the recipient
received for that number proves it.

## Setup

Four values in `.env.local` (gitignored, never committed):

| Variable | What it is |
| --- | --- |
| `E2E_BASE_URL` | the deployed site, e.g. `https://www.leaseinspector.com.au` |
| `E2E_EMAIL` | a purpose-made test account, created through `/signup` |
| `E2E_PASSWORD` | its password |
| `E2E_DATABASE_URL` | the database *that site* reads |

Get the last one with:

```bash
railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL
```

Railway's own `DATABASE_URL` is an internal hostname and unreachable from a
laptop — the public proxy URL is the one that works. It is deliberately **not**
called `DATABASE_URL`, so a run can never silently seed your local development
database and then report a failure that has nothing to do with the code.

### About the test account

Use **email and password, not Google**. Google blocks automated browsers, so an
OAuth account cannot be signed into from here.

Keep it an ordinary account. Nothing in these specs should need admin rights,
and an admin test account means a buggy spec can act on real data.

## What a run leaves behind

Nothing, by design. Each spec seeds its own rows through SQL, marked `[e2e]`,
and deletes exactly what it created — including rows the app itself made during
the run, identified by diffing ids rather than by recency, so the cleanup can
never remove work that was already there. A run that crashes half way is swept
by the next one.

Visitor tracking is the exception, and it looks after itself: Playwright sets
`navigator.webdriver`, so `lib/botDetect.ts` marks these visits as bots and they
stay out of the analytics.

## Adding a spec

Drop a `*.spec.mjs` in this directory exporting `default async function run(browser)`.
`run.mjs` picks it up. Use `describe` / `check` / `assert` from `harness.mjs`;
a check that throws is a failure, so there is no need to catch anything.
