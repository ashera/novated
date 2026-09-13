import { NextResponse } from "next/server";
import { getActiveVersion } from "@/lib/refdata";
import { driftVerdict, findDrift } from "@/lib/au/drift";
import { configToRows } from "@/lib/au/params";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { APP_VERSION, BUILD, GIT_SHA, BUILD_DATE } from "@/lib/version";

/**
 * Does the running site still serve the numbers the source says it should?
 *
 * The calculator reads its rates from a database row, and withDefaults only
 * backfills keys that are MISSING — so a key already present with a stale
 * value survives any amount of fixing in config.ts. That is not theoretical:
 * lct.thresholdOther was verified against the ATO, corrected in code, and
 * production went on serving the old figure until somebody happened to open
 * the backoffice.
 *
 * /admin/review shows the same thing, but only to an admin who thinks to look.
 * This is the version a machine can watch.
 *
 * DELIBERATELY NOT PART OF /api/health. That endpoint is Railway's health
 * check: a non-200 there takes the service out of rotation. A stale tax
 * threshold is a correctness problem, not a reason to stop serving anyone —
 * wiring drift into it would let a wrong number take the whole site down.
 * Keep the two apart, and keep this one out of any deployment probe.
 *
 * Nothing here is secret. Every value is a published tax rate already shown on
 * /glossary and /about, and the build fields are already public on
 * /api/health, so it needs no token.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const build = {
    version: APP_VERSION,
    build: BUILD,
    sha: GIT_SHA,
    builtOn: BUILD_DATE,
  };

  let active;
  try {
    active = await getActiveVersion();
  } catch {
    // Can't read the stored config, so we cannot say anything either way.
    // Reported as not-ok rather than as clean, because "no answer" must never
    // look like "no drift".
    return NextResponse.json(
      { ok: false, reason: "reference data unavailable", checked: 0, drift: [], ...build },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (!active) {
    return NextResponse.json(
      { ok: false, reason: "no active reference-data version", checked: 0, drift: [], ...build },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const drift = findDrift(active.data);
  /*
   * How many parameters were actually compared.
   *
   * The point of reporting it is that a check which silently stops checking
   * passes forever. If configToRows ever returns nothing — a refactor, a
   * descriptor list that fails to load — drift would be empty and this would
   * read as clean while verifying nothing at all. So zero is a failure, not a
   * pass, and the count is published so a monitor can notice it collapsing.
   */
  const checked = configToRows(DEFAULT_CONFIG).length;
  const verdict = driftVerdict(drift.length, checked);

  return NextResponse.json(
    {
      ok: verdict.ok,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      activeFY: active.financial_year,
      checked,
      drift: drift.map((d) => ({
        key: d.key,
        path: d.path,
        label: d.label,
        serving: d.active,
        expected: d.expected,
      })),
      ...build,
      ts: new Date().toISOString(),
    },
    { status: verdict.status, headers: { "cache-control": "no-store" } },
  );
}
