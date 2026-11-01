import type { StatementRow } from "./statement";

/**
 * What the employer actually remitted, against what the provider credited.
 *
 * A novated lease runs GST through three parties and shows the employee one
 * of them. The employer claims the input tax credit on the rental and the
 * fees, pays it across to the provider, and the provider credits it to the
 * lease account — where it finally appears on the statement as "GST Credits".
 *
 * Only the third step is visible in the portal, which makes two questions
 * unanswerable from it. Has the employer remitted everything they claimed?
 * And has the provider passed on everything the employer remitted? On the
 * lease this was built against the answer to the second was no for months at
 * a time: the employer paid every month from December, and the provider
 * credited five months in one lump the following August.
 *
 * So this is the employer's side, read from their accounting export, kept
 * beside the provider's and reconciled against it. Deliberately a separate
 * record rather than more rows in the ledger: the ledger is one account with
 * a running balance, and that balance is what makes each of its lines
 * checkable against the one above it. These transactions belong to a
 * different account and would break that chain.
 */

export interface RemittanceRow {
  /** ISO date. */
  date: string;
  /** What the export called it — the supplier and the reason. */
  description: string;
  /** The employer's own reference, where the export carries one. */
  reference?: string;
  /** Positive: money the employer paid across. */
  amount: number;
  /**
   * A pairing the user has fixed by hand.
   *
   * Absent means "pair it automatically". A string pins this remittance to
   * the ledger row with that key. Null means the user has said this one pairs
   * with nothing — which is a real answer, and not the same as not having
   * looked yet.
   */
  matchKey?: string | null;
}

export interface ParsedRemittances {
  rows: RemittanceRow[];
  /** Lines that looked like data and could not be read, kept for the report. */
  skipped: string[];
  /** Which column each field was taken from, so the UI can show its working. */
  columns: { date: string; description: string; amount: string } | null;
}

/** Split one CSV line, honouring quoted fields and doubled quotes inside them. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Dates, Australian first.
 *
 * An accounting export written here says 05/06/2026 and means June. Read as
 * American it becomes May, which is not a parse error — it is a date eleven
 * months wrong that reconciles against the wrong month and looks plausible
 * doing it. So day-first is the rule, and the only thing that overrides it is
 * a first field too large to be a day.
 */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const [, first, second, rawYear] = slash;
    const a = Number(first);
    const b = Number(second);
    // One of the two fields can settle it on its own; where neither does, the
    // export was written here and means day first.
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) [day, month] = [a, b];
    else if (b > 12 && a <= 12) [day, month] = [b, a];
    else [day, month] = [a, b];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const named = new Date(s);
  if (!Number.isNaN(named.getTime()) && /[a-z]/i.test(s)) {
    return named.toISOString().slice(0, 10);
  }
  return null;
}

function parseMoney(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

/** Header names we recognise, in the order we prefer them. */
const DATE_KEYS = ["date", "transaction date", "payment date"];
const DESC_KEYS = ["details", "description", "narration", "payee", "contact", "reference"];
const AMOUNT_KEYS = ["gross", "amount", "total", "net", "debit", "paid"];
const REF_KEYS = ["reference", "ref", "invoice number", "source"];

const pick = (header: string[], keys: string[]): number => {
  const lower = header.map((h) => h.toLowerCase().trim());
  for (const k of keys) {
    const i = lower.indexOf(k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = lower.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Read an accounting export.
 *
 * Tolerant in the same way the statement parser is, and for the same reason:
 * a person is exporting from software we do not control, into a format that
 * differs by report. What it will not do is guess at a column it cannot name
 * — a amount column picked wrongly is worse than a refusal, because the
 * figures that result look like figures.
 *
 * The GST column is deliberately ignored. On an export of GST payments it
 * reads 0.00, because there is no GST on a GST remittance, and a reader who
 * saw it used would reasonably conclude we had misunderstood the document.
 */
export function parseRemittanceCsv(text: string): ParsedRemittances {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], skipped: [], columns: null };

  const header = splitCsvLine(lines[0]);
  const di = pick(header, DATE_KEYS);
  const mi = pick(header, AMOUNT_KEYS);
  if (di < 0 || mi < 0) {
    return { rows: [], skipped: lines.slice(0, 10), columns: null };
  }
  const si = pick(header, DESC_KEYS);
  const ri = pick(header, REF_KEYS);

  const rows: RemittanceRow[] = [];
  const skipped: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = parseDate(cells[di] ?? "");
    const amount = parseMoney(cells[mi] ?? "");
    if (date == null || amount == null || amount === 0) {
      skipped.push(line);
      continue;
    }
    const ref = ri >= 0 && ri !== si ? cells[ri]?.trim() : undefined;
    rows.push({
      date,
      description: (si >= 0 ? cells[si] : "")?.trim() || "GST remittance",
      ...(ref ? { reference: ref } : {}),
      amount: Math.abs(amount),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows,
    skipped,
    columns: {
      date: header[di],
      description: si >= 0 ? header[si] : "(none)",
      amount: header[mi],
    },
  };
}

/** Merge a fresh export into what is already kept, without duplicating. */
export function mergeRemittances(
  existing: RemittanceRow[],
  incoming: RemittanceRow[],
): { rows: RemittanceRow[]; added: number; alreadyKnown: number } {
  const key = (r: RemittanceRow) => `${r.date}|${r.amount.toFixed(2)}|${r.description}`;
  /* Counted rather than keyed, like the statement log: two identical payments
     on one day are two payments, and an export is a complete view of its own
     window — so the higher count either side has seen is the true one. */
  const count = (rows: RemittanceRow[]) => {
    const m = new Map<string, RemittanceRow[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return m;
  };
  const have = count(existing);
  const want = count(incoming);
  const out: RemittanceRow[] = [...existing];
  let added = 0;
  let alreadyKnown = 0;
  for (const [k, group] of want) {
    const mine = have.get(k)?.length ?? 0;
    alreadyKnown += Math.min(mine, group.length);
    for (let i = mine; i < group.length; i++) {
      out.push(group[i]);
      added++;
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { rows: out, added, alreadyKnown };
}

/* ── Reconciliation ───────────────────────────────────────────────────────── */

export interface GstPair {
  remittance: RemittanceRow;
  credit: StatementRow | null;
  /** Remitted less credited. Positive: the provider passed on less than the
   *  employer sent. */
  difference: number;
  /** Days between the employer paying and the provider crediting. */
  lagDays: number | null;
  /** The user pinned this pairing rather than it being worked out. */
  pinned: boolean;
}

export interface GstReconciliation {
  pairs: GstPair[];
  /** Credits with no remittance to account for them. */
  unmatchedCredits: StatementRow[];
  totalRemitted: number;
  totalCredited: number;
  /** Remitted less credited across everything, matched or not. */
  outstanding: number;
  /**
   * The difference every matched pair shares, where they share one.
   *
   * On a lease whose employer remits GST on the rental and the management fee
   * together while the provider credits only the rental, this is the fee's
   * GST and it is the same number every month. Saying it once is the whole
   * explanation; repeating it on twelve rows is noise.
   */
  commonDifference: number | null;
  /** The longest a remittance waited to reach the lease account. */
  worstLagDays: number | null;
  /**
   * The period each side covers.
   *
   * Reported because the totals are not comparable unless they do. An export
   * pulled over eight months against a ledger kept over twelve will show a
   * shortfall that is only the window, and a reader told "outstanding
   * -$783.88" with nothing else would draw exactly the wrong conclusion.
   */
  remittanceWindow: { from: string; to: string } | null;
  creditWindow: { from: string; to: string } | null;
  /** Whether the two windows line up well enough for the totals to be read
   *  against each other. */
  windowsComparable: boolean;
}

const dayDiff = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );

/**
 * Pair what the employer sent with what the provider credited.
 *
 * Deliberately not a match on amount. The two sides differ by design — the
 * employer remits the GST on the rental AND the fees, the provider credits
 * the rental — so requiring equality would pair nothing at all on a perfectly
 * healthy lease. Matching on amount within a tolerance is worse again: it
 * silently prefers whichever credit happens to be closest in dollars, which
 * on a ledger with nine identical credits is not a choice it is entitled to
 * make.
 *
 * So it is first-in-first-out by date, which is how a provider actually works
 * a queue, and it is the only rule that survives the thing this exists to
 * find: five months of remittances credited on one day. Each remittance takes
 * the earliest credit not already taken that is not before it, and the lag
 * falls out as a number rather than a judgement.
 *
 * With one restraint on top, because date order alone paired badly on the
 * first real data it saw. A credit has to be the right SIZE to be this
 * payment coming back — between {@link MIN_RATIO} and {@link MAX_RATIO} of
 * it. Without that, a stray $3.90 line took a $145.71 credit simply by being
 * next in the queue, and a $149.61 payment took an odd $179.62 credit that
 * plainly belonged to a different claim. The band is deliberately loose: it
 * is there to reject the absurd, not to pick a best fit, because on a ledger
 * with nine identical credits there is no best fit to pick and pretending
 * otherwise would be a guess wearing a number's clothes.
 *
 * Anything it cannot place is reported unplaced rather than forced, and the
 * user can pin it. A pinned remittance takes its credit before any of this
 * runs.
 */
/** A credit smaller than this share of the payment is a different claim. */
const MIN_RATIO = 0.7;
/** Larger than this and the credit is carrying something else as well. */
const MAX_RATIO = 1.05;

export function reconcileGst(
  ledger: StatementRow[],
  remittances: RemittanceRow[],
  rowKeyOf: (r: StatementRow) => string,
): GstReconciliation {
  const credits = ledger
    .filter((r) => r.kind === "gst-credit" && r.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sent = [...remittances].sort((a, b) => a.date.localeCompare(b.date));

  const taken = new Set<StatementRow>();
  const pairs: GstPair[] = [];

  const pairOf = (remittance: RemittanceRow, credit: StatementRow | null, pinned: boolean): GstPair => ({
    remittance,
    credit,
    difference: remittance.amount - (credit?.amount ?? 0),
    lagDays: credit ? dayDiff(remittance.date, credit.date) : null,
    pinned,
  });

  // Pinned first, so a hand-made pairing cannot be stolen by the queue.
  for (const r of sent) {
    if (r.matchKey === undefined) continue;
    if (r.matchKey === null) {
      pairs.push(pairOf(r, null, true));
      continue;
    }
    const hit = credits.find((c) => !taken.has(c) && rowKeyOf(c) === r.matchKey);
    if (hit) taken.add(hit);
    pairs.push(pairOf(r, hit ?? null, true));
  }

  for (const r of sent) {
    if (r.matchKey !== undefined) continue;
    const hit = credits.find(
      (c) =>
        !taken.has(c) &&
        c.date >= r.date &&
        c.amount >= r.amount * MIN_RATIO &&
        c.amount <= r.amount * MAX_RATIO,
    );
    if (hit) taken.add(hit);
    pairs.push(pairOf(r, hit ?? null, false));
  }

  pairs.sort((a, b) => a.remittance.date.localeCompare(b.remittance.date));

  const totalRemitted = sent.reduce((t, r) => t + r.amount, 0);
  const totalCredited = credits.reduce((t, c) => t + c.amount, 0);

  const matched = pairs.filter((p) => p.credit != null);
  const diffs = matched.map((p) => Number(p.difference.toFixed(2)));
  const commonDifference =
    diffs.length > 1 && new Set(diffs).size === 1 ? diffs[0] : null;
  const lags = matched.map((p) => p.lagDays!).filter((n) => Number.isFinite(n));

  const span = (xs: { date: string }[]) =>
    xs.length > 0 ? { from: xs[0].date, to: xs[xs.length - 1].date } : null;
  const remittanceWindow = span(sent);
  const creditWindow = span(credits);
  /* A month either end is slack enough for a credit that lands just after the
     export was pulled; beyond that the two are describing different periods. */
  const SLACK_DAYS = 31;
  const windowsComparable =
    remittanceWindow != null &&
    creditWindow != null &&
    Math.abs(dayDiff(remittanceWindow.to, creditWindow.to)) <= SLACK_DAYS &&
    Math.abs(dayDiff(remittanceWindow.from, creditWindow.from)) <= SLACK_DAYS;

  return {
    pairs,
    unmatchedCredits: credits.filter((c) => !taken.has(c)),
    totalRemitted,
    totalCredited,
    outstanding: totalRemitted - totalCredited,
    commonDifference,
    worstLagDays: lags.length > 0 ? Math.max(...lags) : null,
    remittanceWindow,
    creditWindow,
    windowsComparable,
  };
}
