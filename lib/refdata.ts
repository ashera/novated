import "server-only";
import { query } from "./db";
import { DEFAULT_CONFIG, reviveConfig, type EngineConfig } from "./au/config";
import { configToRows } from "./au/params";
import { computeStaleness } from "./au/staleness";

export interface ParamMeta {
  source: string;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  note: string;
  needsVerification: boolean;
}

export interface RefVersion {
  id: string;
  financial_year: string;
  data: EngineConfig;
  meta: Record<string, ParamMeta>;
  is_active: boolean;
  status: string;
  notes: string | null;
  updated_at: string;
}

/** The EngineConfig the running calculator uses — the active DB version (backfilled
 *  with defaults via withDefaults), or code defaults if the DB is unavailable. */
export async function getActiveConfig(): Promise<EngineConfig> {
  try {
    const r = await query<{ data: EngineConfig }>(
      "select data from ref_data_versions where is_active limit 1",
    );
    return r.rows[0]?.data ? reviveConfig(r.rows[0].data) : DEFAULT_CONFIG;
  } catch {
    // If the DB is unavailable, fall back to code defaults so the calculator still works.
    return DEFAULT_CONFIG;
  }
}

export async function getActiveVersion(): Promise<RefVersion | null> {
  const r = await query<RefVersion>(
    "select id, financial_year, data, meta, is_active, status, notes, updated_at from ref_data_versions where is_active limit 1",
  );
  const row = r.rows[0];
  return row ? { ...row, data: reviveConfig(row.data) } : null;
}

export async function listVersions(): Promise<RefVersion[]> {
  const r = await query<RefVersion>(
    "select id, financial_year, data, meta, is_active, status, notes, updated_at from ref_data_versions order by financial_year desc",
  );
  return r.rows;
}

export async function getVersion(id: string): Promise<RefVersion | null> {
  const r = await query<RefVersion>(
    "select id, financial_year, data, meta, is_active, status, notes, updated_at from ref_data_versions where id = $1",
    [id],
  );
  return r.rows[0] ?? null;
}

export interface AuditEntry {
  id: string;
  financial_year: string | null;
  param_key: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

export async function getAuditLog(
  versionId: string,
  limit = 100,
): Promise<AuditEntry[]> {
  const r = await query<AuditEntry>(
    `select id, financial_year, param_key, action, old_value, new_value, note, changed_by_email, changed_at
       from ref_data_audit where version_id = $1 order by changed_at desc limit $2`,
    [versionId, limit],
  );
  return r.rows;
}

export interface Source {
  id: string;
  key: string;
  name: string;
  organisation: string | null;
  url: string | null;
  description: string | null;
  update_frequency: string | null;
  review_interval_days: number | null;
  last_updated_from: string | null;
  notes: string | null;
  updated_at: string;
}

const SOURCE_COLS = `id, key, name, organisation, url, description, update_frequency,
            review_interval_days,
            to_char(last_updated_from, 'YYYY-MM-DD') as last_updated_from, notes, updated_at`;

export async function listSources(): Promise<Source[]> {
  const r = await query<Source>(
    `select ${SOURCE_COLS} from sources order by organisation, name`,
  );
  return r.rows;
}

export async function getSource(key: string): Promise<Source | null> {
  const r = await query<Source>(
    `select ${SOURCE_COLS} from sources where key = $1`,
    [key],
  );
  return r.rows[0] ?? null;
}

// --- "Due for review" digest -------------------------------------------------

export interface FlaggedParam {
  key: string;
  label: string;
  category: string;
  sourceName: string;
}
export interface SourceAttention {
  key: string;
  name: string;
  organisation: string | null;
  paramCount: number;
  overdueDays: number | null; // stale: >0; due: negative (days until due)
  lastUpdatedFrom: string | null;
}
export interface ReviewData {
  activeFY: string | null;
  versionId: string | null;
  paramsTotal: number;
  verified: number;
  flaggedCount: number; // explicitly needsVerification
  neverVerifiedCount: number; // no verification recorded, not flagged
  flaggedParams: FlaggedParam[];
  staleSources: SourceAttention[];
  dueSources: SourceAttention[];
  dueTotal: number; // total distinct items needing attention
}

/** Aggregate everything that needs a human's attention for the active version. */
export async function buildReviewData(): Promise<ReviewData> {
  const [active, sources] = await Promise.all([getActiveVersion(), listSources()]);
  const empty: ReviewData = {
    activeFY: null,
    versionId: null,
    paramsTotal: 0,
    verified: 0,
    flaggedCount: 0,
    neverVerifiedCount: 0,
    flaggedParams: [],
    staleSources: [],
    dueSources: [],
    dueTotal: 0,
  };
  if (!active) return empty;

  const sourceByKey = new Map(sources.map((s) => [s.key, s]));
  const rows = configToRows(active.data);

  let verified = 0;
  let flaggedCount = 0;
  let neverVerifiedCount = 0;
  const flaggedParams: FlaggedParam[] = [];

  for (const r of rows) {
    const m = active.meta[r.key];
    if (m?.needsVerification) {
      flaggedCount++;
      flaggedParams.push({
        key: r.key,
        label: r.label,
        category: r.category,
        sourceName: sourceByKey.get(r.sourceKey)?.name ?? r.sourceKey,
      });
    } else if (m?.lastVerifiedAt) {
      verified++;
    } else {
      neverVerifiedCount++;
    }
  }

  const now = new Date();
  const paramCountBySource = new Map<string, number>();
  for (const r of rows)
    paramCountBySource.set(r.sourceKey, (paramCountBySource.get(r.sourceKey) ?? 0) + 1);

  const staleSources: SourceAttention[] = [];
  const dueSources: SourceAttention[] = [];
  for (const s of sources) {
    const st = computeStaleness(s.last_updated_from, s.review_interval_days, now);
    const item: SourceAttention = {
      key: s.key,
      name: s.name,
      organisation: s.organisation,
      paramCount: paramCountBySource.get(s.key) ?? 0,
      overdueDays: st.overdueDays,
      lastUpdatedFrom: s.last_updated_from,
    };
    if (st.state === "stale") staleSources.push(item);
    else if (st.state === "due") dueSources.push(item);
  }

  const dueTotal =
    flaggedCount + neverVerifiedCount + staleSources.length + dueSources.length;

  return {
    activeFY: active.financial_year,
    versionId: active.id,
    paramsTotal: rows.length,
    verified,
    flaggedCount,
    neverVerifiedCount,
    flaggedParams,
    staleSources,
    dueSources,
    dueTotal,
  };
}

// --- Test suite results -------------------------------------------------------

export interface TestResultRow {
  area: string;
  name: string;
  status: string; // passed | failed | skipped
  duration_ms: number;
  error: string | null;
}
export interface TestRun {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  created_at: string;
  results: TestResultRow[];
}

export async function getLatestTestRun(): Promise<TestRun | null> {
  const run = await query<Omit<TestRun, "results">>(
    `select id, started_at, finished_at, total, passed, failed, skipped, duration_ms, created_at
       from test_runs order by created_at desc limit 1`,
  );
  if (!run.rows[0]) return null;
  const results = await query<TestResultRow>(
    `select area, name, status, duration_ms, error
       from test_results where run_id = $1 order by area, name`,
    [run.rows[0].id],
  );
  return { ...run.rows[0], results: results.rows };
}

/** Next financial year label, e.g. "2026-27" -> "2027-28". */
export function nextFinancialYear(fy: string): string {
  const [start] = fy.split("-").map((s) => parseInt(s, 10));
  const nextStart = start + 1;
  const nextEnd = (nextStart + 1) % 100;
  return `${nextStart}-${String(nextEnd).padStart(2, "0")}`;
}
