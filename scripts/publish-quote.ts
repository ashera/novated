/**
 * Put a quote on the live site and hand back a share link.
 *
 *   npm run publish:quote -- path/to/quote.json
 *   npm run publish:quote -- path/to/quote.json --dry-run
 *   npm run publish:quote -- --revoke <leaseId>
 *   npm run publish:quote -- --list
 *
 * For the case where somebody has a provider's PDF or photo and wants the
 * analysis of it at a URL they can send on. Transcribing the document is the
 * part that needs a person (or a model) reading it; everything after that is
 * mechanical, and this is the mechanical part.
 *
 * It writes to the PRODUCTION database, so it is deliberately loud: it decodes
 * the quote and prints the rate BEFORE writing anything, refuses figures it
 * cannot solve unless told to proceed, names the account it is about to write
 * to, and prints the command to undo itself. `--dry-run` does everything
 * except the write.
 *
 * The lease is owned by a real account rather than parked somewhere anonymous,
 * so it shows up in that person's own list — editable, re-shareable, and
 * revocable from the UI like any other. The share link is the lease's
 * capability token plus the quote id, which is the narrow share: the quote's
 * analysis, not the lease behind it.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { decodeQuote } from "../lib/au/quote";
import { leaseToQuote, migrateLease, newQuoteSpec } from "../lib/au/lease";
import type { QuoteSpec, VehicleSpec, ScenarioSpec } from "../lib/au/lease";

/** The shape of the file you hand it. Everything but `quote` is optional. */
interface PublishSpec {
  /** Whose account it lands in. Must already exist. */
  owner: string;
  /** What to call the lease in that person's list. */
  leaseName?: string;
  vehicle?: Partial<VehicleSpec>;
  scenario?: Partial<ScenarioSpec>;
  quote: Partial<QuoteSpec> & { termMonths: number };
}

const SITE = (process.env.E2E_BASE_URL ?? "https://www.leaseinspector.com.au").replace(/\/$/, "");
const DB_URL = process.env.LIVE_DATABASE_URL ?? process.env.E2E_DATABASE_URL;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const valueOf = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

function connect() {
  if (!DB_URL) {
    throw new Error(
      "No database URL. Set E2E_DATABASE_URL (or LIVE_DATABASE_URL) in .env.local — it is the\n" +
        "Postgres service's DATABASE_PUBLIC_URL, from:\n" +
        "  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL",
    );
  }
  return new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
}

async function list(db: Client) {
  const r = await db.query(
    `select l.id, l.name, u.email, l.share_token, l.created_at
       from leases l join users u on u.id = l.user_id
      where l.share_token is not null
      order by l.created_at desc limit 20`,
  );
  if (!r.rows.length) return console.log("No shared leases.");
  for (const row of r.rows) {
    console.log(`\n${row.name}   ${row.email}`);
    console.log(`  lease  ${row.id}`);
    console.log(`  shared ${row.created_at.toISOString().slice(0, 10)}`);
  }
}

async function revoke(db: Client, leaseId: string) {
  const r = await db.query(
    "update leases set share_token = null where id = $1 returning name",
    [leaseId],
  );
  if (!r.rowCount) throw new Error(`No lease ${leaseId}`);
  console.log(`Revoked the share link on "${r.rows[0].name}". The lease itself is untouched.`);
  console.log(`To delete it entirely:\n  npm run publish:quote -- --delete ${leaseId}`);
}

async function remove(db: Client, leaseId: string) {
  const r = await db.query("delete from leases where id = $1 returning name", [leaseId]);
  if (!r.rowCount) throw new Error(`No lease ${leaseId}`);
  console.log(`Deleted "${r.rows[0].name}" and its quotes.`);
}

async function publish(db: Client, spec: PublishSpec) {
  const owner = spec.owner?.toLowerCase().trim();
  if (!owner) throw new Error("The spec needs an `owner` — the email of the account to put it in.");

  const u = await db.query<{ id: string; email: string }>(
    "select id, email from users where lower(email) = $1",
    [owner],
  );
  if (u.rowCount !== 1) {
    throw new Error(`Expected exactly one account for ${owner}, found ${u.rowCount}.`);
  }
  const user = u.rows[0];

  /*
   * Built through the real model so a quote published here is indistinguishable
   * from one typed into the app — same defaults, same migrations, same shape.
   * migrateLease is what fills in anything a field added later expects.
   */
  const quote: QuoteSpec = {
    ...newQuoteSpec(spec.quote.label ?? "Provider quote", spec.quote.termMonths),
    ...spec.quote,
    id: newQuoteSpec().id,
  };

  const lease = migrateLease({
    version: 1,
    name: spec.leaseName ?? `${quote.label} quote`,
    vehicle: { fuelType: "petrol", ...spec.vehicle },
    scenario: { ...spec.scenario },
    quotes: [quote],
  });

  // ── What it says, before anything is written ──────────────────────────────

  const decoded = decodeQuote(leaseToQuote(lease, quote), DEFAULT_CONFIG);

  console.log(`\nAccount   ${user.email}`);
  console.log(`Lease     ${lease.name}`);
  console.log(`Quote     ${quote.label}   ${quote.termMonths} months, ${quote.frequency}`);
  if (decoded.amountFinanced != null) {
    console.log(
      `Financed  ${money(decoded.amountFinanced)}` +
        (decoded.financedWasDerived ? "  (derived from the price)" : ""),
    );
  }
  if (quote.residualIncGst != null) console.log(`Residual  ${money(quote.residualIncGst)} inc GST`);

  if (decoded.impliedRatePct == null) {
    console.log(`\nRate      cannot be solved — ${decoded.rateBlockedBy ?? "not enough figures"}`);
    if (!flag("force")) {
      throw new Error(
        "Refusing to publish a quote whose rate cannot be worked out: the shared page would\n" +
          "have nothing to say. Add the missing figures, or pass --force to publish anyway.",
      );
    }
    console.log("          (--force given, publishing regardless)");
  } else {
    console.log(`\nRate      ${decoded.impliedRatePct.toFixed(2)}%  all-in`);
    if (decoded.rateAfterDeferralPct != null) {
      console.log(`          ${decoded.rateAfterDeferralPct.toFixed(2)}%  once the deferral is allowed for`);
    }
    if (decoded.totalInterest != null) console.log(`Interest  ${money(decoded.totalInterest)} over the term`);
  }

  const notable = decoded.findings.filter((f) => f.severity !== "ok");
  if (notable.length) {
    console.log(`\nFindings  ${notable.length} worth a look:`);
    for (const f of notable) console.log(`  · ${f.title}`);
  }
  // Figures come off a document by hand; against DEFAULT_CONFIG, not the live
  // reference data, so the page itself may word things slightly differently.
  console.log("\n(preview computed against default reference data; the live page uses the active set)");

  if (flag("dry-run")) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  const token = randomBytes(24).toString("base64url");
  const inserted = await db.query<{ id: string }>(
    `insert into leases (user_id, name, vehicle, scenario, share_token)
     values ($1, $2, $3, $4, $5) returning id`,
    [user.id, lease.name, lease.vehicle, lease.scenario, token],
  );
  const leaseId = inserted.rows[0].id;
  await db.query("insert into lease_quotes (lease_id, label, data) values ($1, $2, $3)", [
    leaseId,
    quote.label,
    quote,
  ]);

  console.log(`\nShare this:\n  ${SITE}/s/${token}/quote/${quote.id}`);
  console.log(`\nIt is in ${user.email}'s lease list as "${lease.name}".`);
  console.log(`  revoke the link:  npm run publish:quote -- --revoke ${leaseId}`);
  console.log(`  delete it:        npm run publish:quote -- --delete ${leaseId}`);
}

async function main() {
  const db = connect();
  await db.connect();
  try {
    if (flag("list")) return await list(db);
    if (flag("revoke")) return await revoke(db, valueOf("revoke")!);
    if (flag("delete")) return await remove(db, valueOf("delete")!);

    const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--revoke");
    if (!file) {
      throw new Error(
        "Usage:\n" +
          "  npm run publish:quote -- quote.json [--dry-run] [--force]\n" +
          "  npm run publish:quote -- --list\n" +
          "  npm run publish:quote -- --revoke <leaseId>\n" +
          "  npm run publish:quote -- --delete <leaseId>",
      );
    }
    await publish(db, JSON.parse(readFileSync(file, "utf8")) as PublishSpec);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
