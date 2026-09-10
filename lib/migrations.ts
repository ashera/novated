// Single source of truth for the database schema and idempotent seed data.
// Imported by scripts/migrate.ts (run on every deploy) and the granular seed
// scripts. Every statement here MUST be safe to run repeatedly.
import type { Client } from "pg";
import { DEFAULT_CONFIG } from "./au/config";
import { PARAM_DESCRIPTORS } from "./au/params";
import { SOURCE_SEEDS } from "./au/sources";
import { RELEASE_HISTORY } from "./releaseHistory";
import { APP_VERSION, BUILD, GIT_SHA, BUILD_DATE, COMMITS } from "./version";

export const SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text,
  is_admin boolean not null default false,
  suspended boolean not null default false,
  last_login_at timestamptz,
  -- Google sign-in (OAuth). google_sub = Google's stable per-user id; name and
  -- avatar come from the profile. password_hash is nullable so a Google-only
  -- account (one that never set a password) is valid. NULL google_subs may
  -- repeat — a unique index treats NULLs as distinct.
  google_sub text,
  name text,
  avatar_url text,
  -- Best-effort country (2-letter ISO) and city coordinates of the account,
  -- from the IP at sign-in. The raw IP is never stored for accounts.
  country text,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);
create unique index if not exists users_google_sub_idx on users (google_sub);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_token_idx on sessions(token);

-- One-time password-reset tokens (only the sha256 hash is stored, never the raw
-- token), with a short expiry. Cleared per-user when a new one is requested.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_token_hash_idx on password_resets (token_hash);

-- A saved lease scenario. \`data\` is a LeaseScenario (lib/au/types.ts) — the
-- user's INPUTS only, never computed results, so every scenario re-runs against
-- the current reference data when it is opened.
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  -- Capability token for a public, read-only share link (null = not shared).
  -- Anyone with the link can view; the owner revokes it by nulling it.
  share_token text,
  -- Private notes the owner keeps on a scenario. Deliberately kept OUT of the
  -- share payload and out of plans.data.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_user_idx on plans(user_id);
create unique index if not exists plans_share_uidx on plans(share_token) where share_token is not null;

-- The user's ACTIVE scenario — the one continuous auto-save writes to, and which
-- follows them across devices. Nulled if that scenario is deleted, so the app
-- can fall back to another (or create a fresh one).
alter table users add column if not exists active_plan_id uuid references plans(id) on delete set null;

-- Free-form user feedback from the floating widget. user_id is kept if they were
-- signed in (set null if the account is later deleted); email is an optional
-- reply-to. handled = an admin has actioned/triaged it.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  email text,
  sentiment text,            -- love | ok | frustrated (optional)
  message text not null,
  path text,                 -- page they were on when they submitted
  user_agent text,
  handled boolean not null default false,
  -- When this row was included in a digest email to the team (null = still
  -- pending). Drives the debounced batch notifier.
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_unnotified_idx on feedback (created_at) where notified_at is null;

-- Effective-dated reference-data versions (one per financial year).
create table if not exists ref_data_versions (
  id uuid primary key default gen_random_uuid(),
  financial_year text unique not null,
  data jsonb not null,                      -- the full EngineConfig
  meta jsonb not null default '{}'::jsonb,  -- per-param governance (source, lastVerifiedAt, ...)
  is_active boolean not null default false,
  status text not null default 'draft',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one active version at a time.
create unique index if not exists ref_data_one_active on ref_data_versions (is_active) where is_active;

-- First-class reference-data sources (the ATO page a rate came from, and when we
-- last checked it).
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  organisation text,
  url text,
  description text,
  update_frequency text,
  review_interval_days int,      -- days before the source is stale (null = no schedule)
  last_updated_from date,        -- when we last refreshed our data from this source
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only change history for reference data (and sources).
create table if not exists ref_data_audit (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references ref_data_versions(id) on delete cascade,
  financial_year text,
  param_key text,
  source_key text,
  action text not null,          -- edit | verify | create | activate | note | source_edit | source_update
  old_value text,
  new_value text,
  note text,
  changed_by uuid references users(id),
  changed_by_email text,
  changed_at timestamptz not null default now()
);
create index if not exists ref_audit_version_idx on ref_data_audit(version_id, changed_at desc);

-- Test suite tracking: one row per run, one row per test. Populated by
-- \`npm run test:record\` and surfaced at /admin/tests.
create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  total int not null default 0,
  passed int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references test_runs(id) on delete cascade,
  area text not null,
  name text not null,
  status text not null,        -- passed | failed | skipped
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists test_results_run_idx on test_results(run_id, area);

-- Anonymous (not-signed-in) visitor analytics. One row per browser, keyed by a
-- long-lived cookie. Captures the funnel the users table can't see: who looked
-- around without signing up and how far they got. signed_up flips true if that
-- browser later authenticates (conversion), after which we stop tracking it.
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_key text unique not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits int not null default 1,
  -- Funnel milestones for this app: did they price a car, and did they get as
  -- far as the comparison / the full report?
  priced_vehicle boolean not null default false,
  vehicle_price numeric,
  set_salary boolean not null default false,
  salary numeric,
  visited_compare boolean not null default false,
  visited_report boolean not null default false,
  signed_up boolean not null default false,
  country text,
  region text,
  city text,
  ip text,
  locale text,
  user_agent text,
  -- How the country was determined: 'geoip' (offline IP lookup) or
  -- 'header:<name>' (a proxy geo header). Drives the "on what basis" explainer.
  geo_source text,
  -- The account this browser converted into, set at sign-in alongside signed_up.
  converted_user_id uuid references users(id) on delete set null,
  lat double precision,
  lon double precision,
  -- Likely-bot flag (from UA + client navigator.webdriver). Nullable = not yet
  -- classified (older rows, backfilled on deploy). bot_reason = why we flagged it.
  is_bot boolean,
  bot_reason text
);
create index if not exists visitors_last_seen_idx on visitors (last_seen_at desc);

-- Per-visitor action log: the sequence of things an anonymous visitor did (page
-- views plus named UI events tee'd from the client analytics stream), so the
-- admin can see what someone actually did before they bounced. Capped in code.
create table if not exists visitor_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references visitors(id) on delete cascade,
  event text not null,           -- 'pageview' or a named track() event
  path text,                     -- the page it happened on
  props jsonb,                   -- optional event properties
  created_at timestamptz not null default now()
);
create index if not exists visitor_events_visitor_idx on visitor_events (visitor_id, created_at);

-- Release notes / changelog: one row per prod release, authored in the
-- backoffice. notes is a JSON array of plain-language bullet strings.
create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  build integer,
  commit_hash text,
  released_at date not null default current_date,
  title text,
  notes jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists releases_pub_idx on releases(published, released_at desc, build desc);
create unique index if not exists releases_version_uidx on releases(version);

-- InfoBlasts: backoffice-managed announcements that rotate in the hero banner.
create table if not exists info_blasts (
  id uuid primary key default gen_random_uuid(),
  icon text not null default '',
  title text not null,
  subtext text not null default '',
  link_url text not null default '',
  link_label text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists info_blasts_active_idx on info_blasts(enabled, sort_order, created_at);
`;

/** Apply the schema. Safe to run repeatedly. */
export async function applySchema(c: Client): Promise<void> {
  await c.query(SCHEMA_SQL);
}

/**
 * Parameters seeded from code that a human has NOT yet checked against the
 * source. These are the ones that move most often (indexed thresholds and
 * market-sampled figures), so they start life flagged for verification and show
 * up in the admin "Review" digest until someone signs them off.
 */
const NEEDS_VERIFICATION = new Set([
  "gst_car_limit",
  "lct_threshold_fe",
  "lct_threshold_other",
  "medicare_threshold",
  "lease_default_rate",
  "lease_admin_fee",
  "lease_establishment_fee",
  "run_price_litre",
  "run_price_kwh",
  "run_registration",
]);

/**
 * Seed the active reference-data version from code defaults, but only if a
 * version for this financial year doesn't already exist — never clobbers admin
 * edits made through the backoffice.
 */
export async function seedRefData(c: Client): Promise<void> {
  const meta: Record<string, unknown> = {};
  for (const d of PARAM_DESCRIPTORS) {
    meta[d.key] = {
      lastVerifiedAt: null,
      verifiedBy: null,
      note: "",
      needsVerification: NEEDS_VERIFICATION.has(d.key) || d.sourceKey === "market-lease-terms",
    };
  }

  const fy = DEFAULT_CONFIG.financialYear;
  const existing = await c.query(
    "select id from ref_data_versions where financial_year = $1",
    [fy],
  );

  if (existing.rows.length) {
    console.log(`  ref-data: FY${fy} already present — left untouched.`);
    return;
  }

  const r = await c.query(
    `insert into ref_data_versions (financial_year, data, meta, is_active, status, notes)
     values ($1, $2, $3, true, 'active', $4) returning id`,
    [fy, JSON.stringify(DEFAULT_CONFIG), JSON.stringify(meta), "Seeded from code defaults."],
  );
  await c.query(
    `insert into ref_data_audit (version_id, financial_year, action, note)
     values ($1, $2, 'create', 'Seeded active version from code defaults')`,
    [r.rows[0].id, fy],
  );
  console.log(`  ref-data: seeded active version FY${fy} (${PARAM_DESCRIPTORS.length} params).`);
}

/**
 * Upsert the reference-data sources. Inserts new sources and backfills the
 * review interval where missing; never clobbers other admin-managed attributes.
 */
export async function seedSources(c: Client): Promise<void> {
  for (const s of SOURCE_SEEDS) {
    await c.query(
      `insert into sources (key, name, organisation, url, update_frequency, review_interval_days, description)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (key) do update
         set review_interval_days = coalesce(sources.review_interval_days, excluded.review_interval_days)`,
      [s.key, s.name, s.organisation, s.url, s.updateFrequency, s.reviewIntervalDays, s.description],
    );
  }
  console.log(`  sources: upserted ${SOURCE_SEEDS.length} (review intervals backfilled, other attributes preserved).`);
}

/** Backfill the hand-written release history. Idempotent on the version index. */
export async function seedReleases(c: Client): Promise<void> {
  let added = 0;
  for (const r of RELEASE_HISTORY) {
    const res = await c.query(
      `insert into releases (version, build, commit_hash, released_at, title, notes, published)
       values ($1, $2, $3, $4, $5, $6, true)
       on conflict (version) do nothing`,
      [r.version, r.build, r.commit, r.date, r.title, JSON.stringify(r.notes)],
    );
    added += res.rowCount ?? 0;
  }
  console.log(`  releases: backfilled ${added} of ${RELEASE_HISTORY.length} historical release(s).`);
}

/**
 * Auto-draft a release for THIS build on deploy. Inserts one UNPUBLISHED row for
 * the current version whose notes are the commit subjects since the most recent
 * existing release — so every push lands a ready-to-curate changelog entry in
 * /admin/releases without touching the public /releases page until someone edits
 * and publishes it. Idempotent: the unique `version` index makes a re-deploy of
 * the same build a no-op. Reads commits from lib/version.ts (captured at build
 * time), so it needs no git at deploy time.
 */
export async function autoDraftRelease(c: Client): Promise<void> {
  const exists = await c.query("select 1 from releases where version = $1", [APP_VERSION]);
  if (exists.rowCount) {
    console.log(`  releases: ${APP_VERSION} already present — no auto-draft.`);
    return;
  }
  // Boundary = the newest release by build (a draft counts, so consecutive
  // un-published deploys don't each re-scan from the last PUBLISHED release and
  // duplicate bullets).
  const last = await c.query<{ commit_hash: string | null }>(
    "select commit_hash from releases order by build desc nulls last, created_at desc limit 1",
  );
  const lastSha = last.rows[0]?.commit_hash ?? null;
  // COMMITS is newest-first. Take everything ABOVE the last release's commit. If
  // it's outside the captured window, fall back to the most recent handful.
  const idx = lastSha ? COMMITS.findIndex((x) => x.sha === lastSha) : -1;
  const fresh = lastSha ? (idx >= 0 ? COMMITS.slice(0, idx) : COMMITS.slice(0, 10)) : COMMITS.slice(0, 10);
  const notes = fresh.map((x) => x.subject).slice(0, 30);
  if (!notes.length) {
    console.log(`  releases: no new commits since ${lastSha ?? "(none)"} — no auto-draft.`);
    return;
  }
  await c.query(
    `insert into releases (version, build, commit_hash, released_at, title, notes, published)
     values ($1, $2, $3, $4, $5, $6, false)
     on conflict (version) do nothing`,
    [APP_VERSION, BUILD, GIT_SHA, BUILD_DATE, `Draft — build ${BUILD} (needs review)`, JSON.stringify(notes)],
  );
  console.log(`  releases: auto-drafted ${APP_VERSION} with ${notes.length} commit note(s) — UNPUBLISHED.`);
}

export async function migrate(c: Client): Promise<void> {
  await applySchema(c);
  console.log("  schema: applied.");
  await seedRefData(c);
  await seedSources(c);
  await seedReleases(c);
  await autoDraftRelease(c);
}
