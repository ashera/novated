import type { EngineConfig } from "./config";
import type { Finding } from "./quote";
import { readStatement, reconcile, type RowKind, type StatementRow } from "./statement";

/**
 * The statement, kept rather than read once.
 *
 * A single paste answers "what happened lately". A log answers the questions
 * that actually matter over a five-year lease: is the deduction covering the
 * car, which category is drifting, what has this actually cost, and is
 * anything missing. None of that is visible in one window of a portal, which
 * only ever shows the last twenty-five rows.
 *
 * People will paste overlapping windows — the same page twice, or last month's
 * again with a few new lines on top — so merging has to be idempotent. That
 * turns out to be the whole difficulty, because the rows are not distinct:
 * the real statement this was built against has six GST credits on one day,
 * all $145.71, identical in every field except the running balance.
 */

/** A row in the stored log. Same shape as a parsed one — these are inputs, and
 *  everything derived is recomputed on read. */
export type LoggedRow = StatementRow;

/**
 * What makes two rows the same transaction.
 *
 * The balance is the discriminator when it is there: two identical credits on
 * one day differ by where they left the account, and that is exactly what
 * distinguishes them on the statement itself. Where a provider prints no
 * balance there is nothing left to tell identical rows apart, so they are
 * counted rather than keyed — see `mergeRows`.
 */
export function rowKey(r: StatementRow): string {
  const money = (n: number) => n.toFixed(2);
  return r.balance != null
    ? `${r.date}|${r.description}|${money(r.amount)}|${money(r.balance)}`
    : `${r.date}|${r.description}|${money(r.amount)}`;
}

export interface MergeResult {
  rows: LoggedRow[];
  added: number;
  alreadyKnown: number;
  /** Rows that match an existing one on everything but the balance. Either the
   *  statement was restated or the paste was partial; worth saying rather than
   *  silently keeping both. */
  conflicts: { existing: LoggedRow; incoming: LoggedRow }[];
}

/**
 * Fold a fresh paste into the log.
 *
 * Two rules, because there are two kinds of row.
 *
 * With a balance, a row is its own identity and the merge is a set union.
 *
 * Without one, identical rows are indistinguishable, so the log keeps the
 * HIGHEST count either side has seen for that date, description and amount
 * rather than adding them up. A paste is a complete view of its own window, so
 * seeing the same pair of $85 fuel charges twice means two charges, not four —
 * while a later paste showing three means a third has since appeared.
 */
export function mergeRows(existing: LoggedRow[], incoming: StatementRow[]): MergeResult {
  const out = [...existing];
  const conflicts: MergeResult["conflicts"] = [];
  let added = 0;
  let alreadyKnown = 0;

  const keyed = new Set(out.filter((r) => r.balance != null).map(rowKey));

  // Rows a provider prints without a running balance, counted per group.
  const group = (r: StatementRow) => `${r.date}|${r.description}|${r.amount.toFixed(2)}`;
  const countIn = (rows: StatementRow[], g: string) =>
    rows.filter((r) => r.balance == null && group(r) === g).length;

  for (const row of incoming) {
    if (row.balance != null) {
      const k = rowKey(row);
      if (keyed.has(k)) {
        alreadyKnown++;
        continue;
      }
      /*
       * Same transaction, different balance: the statement has been restated,
       * or one of the two pastes was missing a line above it.
       *
       * Searched against what was ALREADY stored, not against `out`, which
       * grows as this paste is applied. Comparing with rows from the same
       * paste made the six identical GST credits report each other as
       * conflicts — a first paste into an empty log announced four, which an
       * empty log cannot have. Two rows differing only by balance within one
       * statement are the normal case; the same thing across two statements is
       * the finding.
       */
      const sameButBalance = existing.find(
        (r) =>
          r.balance != null &&
          r.date === row.date &&
          r.description === row.description &&
          Math.abs(r.amount - row.amount) < 0.005 &&
          Math.abs((r.balance ?? 0) - row.balance!) > 0.005,
      );
      if (sameButBalance) conflicts.push({ existing: sameButBalance, incoming: row });
      out.push(row);
      keyed.add(k);
      added++;
    } else {
      const g = group(row);
      const have = countIn(out, g);
      const want = countIn(incoming, g);
      if (have >= want) {
        alreadyKnown++;
        continue;
      }
      out.push(row);
      added++;
    }
  }

  return { rows: orderLog(out), added, alreadyKnown, conflicts };
}

/**
 * Put the log back into the order the statement had it.
 *
 * Date alone is not enough — the real ledger has six rows on one day and two
 * on another — and the balance is no help as a sort key either, because it
 * falls on a debit and rises on a credit, so neither direction is right. The
 * first attempt sorted ascending by balance and turned two registration
 * payments back to front, which then read as a gap in an unbroken log.
 *
 * What does order them is the chain itself: within a day, the next row is
 * whichever one starts where the last left off. So each day is rebuilt by
 * following the balance, carrying the closing figure across from the day
 * before. Anything that will not chain — a row with no balance, or a day
 * pasted incompletely — keeps the order it arrived in, which is the best
 * guess available and never worse than the sort it replaces.
 */
export function orderLog(rows: LoggedRow[]): LoggedRow[] {
  const days = new Map<string, LoggedRow[]>();
  for (const r of rows) {
    const list = days.get(r.date);
    if (list) list.push(r);
    else days.set(r.date, [r]);
  }

  const out: LoggedRow[] = [];
  let prev: number | null = null;
  for (const date of [...days.keys()].sort()) {
    const pool = days.get(date)!;
    const chained: LoggedRow[] = [];
    while (pool.length > 0) {
      // Annotated because the loop reassigns `prev`, which TypeScript would
      // otherwise have to infer from an expression that depends on it.
      const carry: number | null = prev;
      const i: number =
        carry == null
          ? -1
          : pool.findIndex(
              (r) => r.balance != null && Math.abs(r.balance - r.amount - carry) < 0.005,
            );
      if (i < 0) break;
      const row: LoggedRow = pool.splice(i, 1)[0];
      chained.push(row);
      prev = row.balance!;
    }
    // Whatever would not chain, in the order it came.
    for (const row of pool) {
      chained.push(row);
      if (row.balance != null) prev = row.balance;
    }
    out.push(...chained);
  }
  return out;
}

export interface MonthPoint {
  /** "2026-08" */
  month: string;
  in: number;
  out: number;
  /** Closing balance printed on the last row of that month, where there is one. */
  balance: number | null;
  byKind: Partial<Record<RowKind, number>>;
}

/** The log by calendar month, which is the grain everything about a lease is
 *  quoted in — the deduction, the budgets, the rental. */
export function byMonth(rows: LoggedRow[]): MonthPoint[] {
  const months = new Map<string, MonthPoint>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    let point = months.get(m);
    if (!point) {
      point = { month: m, in: 0, out: 0, balance: null, byKind: {} };
      months.set(m, point);
    }
    if (r.amount > 0) point.in += r.amount;
    else point.out += -r.amount;
    point.byKind[r.kind] = (point.byKind[r.kind] ?? 0) + r.amount;
    if (r.balance != null) point.balance = r.balance;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface LogGap {
  after: LoggedRow;
  before: LoggedRow;
  /** What the balance jumped by with nothing to explain it. */
  unexplained: number;
}

/**
 * Where the log is missing rows.
 *
 * The reason a log is worth more than a paste. A single window reconciles
 * against itself and looks complete; stitch two windows together and the seam
 * shows — if one row's balance does not lead to the next, transactions between
 * them were never pasted. That is a completeness check, and it cannot be done
 * without history.
 */
export function findGaps(rows: LoggedRow[]): LogGap[] {
  const withBalance = rows.filter((r) => r.balance != null);
  const gaps: LogGap[] = [];
  for (let i = 1; i < withBalance.length; i++) {
    const prev = withBalance[i - 1];
    const here = withBalance[i];
    const expected = prev.balance! + here.amount;
    if (Math.abs(expected - here.balance!) > 0.005) {
      gaps.push({ after: prev, before: here, unexplained: here.balance! - expected });
    }
  }
  return gaps;
}

export interface LogAnalysis {
  rows: LoggedRow[];
  months: MonthPoint[];
  gaps: LogGap[];
  /** Whole months of history, at least one. */
  span: number;
  /** Signed totals by category over the whole log. */
  totals: Partial<Record<RowKind, number>>;
  /** What has left payroll for this car, all told. */
  contributed: number;
  /** Where the balance finished. */
  balance: number | null;
  findings: Finding[];
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/**
 * Everything the log knows that a single statement cannot.
 *
 * Deliberately built on top of `readStatement` rather than beside it: a log IS
 * a statement, just a longer one, so the single-window findings all still
 * apply and would otherwise have to be written twice.
 */
export function analyseLog(rows: LoggedRow[], config: EngineConfig): LogAnalysis {
  const months = byMonth(rows);
  const gaps = findGaps(rows);
  const read = readStatement(rows, config);
  const findings: Finding[] = [...read.findings];

  const totals: Partial<Record<RowKind, number>> = {};
  for (const r of rows) totals[r.kind] = (totals[r.kind] ?? 0) + r.amount;
  const contributed = totals.payroll ?? 0;
  const balance = [...rows].reverse().find((r) => r.balance != null)?.balance ?? null;
  const span = Math.max(1, months.length);

  /*
   * Gaps first, because they undermine everything below them.
   *
   * A reconcile break inside one paste is probably an error in the statement.
   * The same break between two pastes is almost always a missing window, and
   * saying so is both more likely to be true and more useful — it names a
   * thing the reader can go and fix.
   */
  if (gaps.length > 0) {
    const worst = [...gaps].sort((a, b) => Math.abs(b.unexplained) - Math.abs(a.unexplained))[0];
    findings.push({
      key: "log-has-gaps",
      severity: "warn",
      category: "Log",
      title: `${gaps.length} stretch${gaps.length === 1 ? "" : "es"} of missing transactions`,
      detail: `Between ${worst.after.date} and ${worst.before.date} the balance moves by ${money(Math.abs(worst.unexplained))} more than the rows in between account for, so transactions from that period have not been pasted in yet. Totals and averages below are short by whatever is in the gap — go back to the portal for that period and paste it in.`,
      costOverTerm: Math.abs(worst.unexplained),
    });
  }

  /*
   * Has the deduction changed?
   *
   * The thing people notice and cannot explain, and the log is the only place
   * it is visible: one statement shows the current figure, several show the
   * step. Compares distinct payroll amounts rather than month totals, because
   * a month with two pay runs is not a raise.
   */
  const payrollAmounts = [...new Set(rows.filter((r) => r.kind === "payroll").map((r) => Math.round(r.amount * 100) / 100))];
  if (payrollAmounts.length > 1) {
    const lo = Math.min(...payrollAmounts);
    const hi = Math.max(...payrollAmounts);
    const latest = rows.filter((r) => r.kind === "payroll").at(-1)!;
    findings.push({
      key: "deduction-changed",
      severity: "warn",
      category: "Deductions",
      title: `Your deduction has changed — ${money(lo)} to ${money(hi)}`,
      detail: `The amount coming out of your pay is not the same across this log; the most recent is ${money(latest.amount)} on ${latest.date}. Providers reset it at a review, usually because the account was running down. Worth knowing what it was set against, since a deduction raised to cover a one-off bill does not always come back down.`,
      costOverTerm: (hi - lo) * 12,
      question: `My deduction changed from ${money(lo)} to ${money(hi)}. What was that based on, and when is it next reviewed?`,
    });
  }

  /*
   * Where the money actually goes.
   *
   * Only worth saying with enough history behind it: a single month of fuel is
   * a number, six months of it is a rate — and a rate is the thing that can be
   * compared with the budget that was quoted.
   */
  if (span >= 3) {
    const running: RowKind[] = ["fuel", "insurance", "registration", "maintenance", "tyres", "roadside"];
    const runningTotal = running.reduce((t, k) => t + Math.abs(totals[k] ?? 0), 0);
    const finance = Math.abs(totals.finance ?? 0);
    if (runningTotal > 0 && finance > 0) {
      const biggest = running
        .map((k) => ({ k, v: Math.abs(totals[k] ?? 0) }))
        .sort((a, b) => b.v - a.v)[0];
      findings.push({
        key: "where-it-goes",
        severity: "ok",
        category: "Spending",
        title: `${money(runningTotal / span)} a month on running the car, ${money(finance / span)} on the finance`,
        detail: `Over ${span} months: ${money(finance)} to the financier and ${money(runningTotal)} on running costs, of which ${biggest.k} is the largest at ${money(biggest.v)}. The finance is fixed for the term; the running costs are the half you have some say over, and the half a provider's budget can be wrong about in either direction.`,
      });
    }
  }

  findings.sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, warn: 1, ok: 2 };
    return rank[a.severity] - rank[b.severity] || (b.costOverTerm ?? 0) - (a.costOverTerm ?? 0);
  });

  return { rows, months, gaps, span, totals, contributed, balance, findings };
}

/** Rows that are no longer wanted — the log is the user's, so it has to be
 *  possible to take something out of it as well as put something in. */
export function removeRows(rows: LoggedRow[], keys: string[]): LoggedRow[] {
  const drop = new Set(keys);
  return rows.filter((r) => !drop.has(rowKey(r)));
}

export { reconcile };
