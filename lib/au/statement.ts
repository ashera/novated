import type { EngineConfig } from "./config";
import type { Finding } from "./quote";

/**
 * The account a novated lease actually runs through.
 *
 * Everything else on this site is about the decision. This is about the five
 * years after it, and it is the part nobody explains: money leaves payroll
 * into an account held by the provider, and bills are paid out of it. The
 * statement is a ledger of that account, and the questions people have about
 * it are all the same shape — whose money is this, why did it go down, what is
 * this line, and am I ahead or behind.
 *
 * Three things make a ledger worth reading by machine rather than by eye:
 *
 * It can be RECONCILED. Every row carries a running balance, so each line is a
 * claim that can be checked against the one above it. A ledger that does not
 * add up is worth knowing about immediately, and nobody checks.
 *
 * Its lines can be CLASSIFIED. "Funds from Payroll", "Lease — <financier>",
 * "GST Credits", "Insurance — Reimbursement" mean different things, and the
 * shape of the account only appears once they are grouped.
 *
 * It can be MEASURED against the quote that was signed. The decoder predicts
 * that a budget is padded; twelve months of this proves it.
 *
 * Deliberately tolerant about input. Providers print these differently and a
 * person is pasting from a portal, so the parser takes what it can and reports
 * what it could not, rather than refusing a document because one line is odd.
 */

export type RowKind =
  | "payroll"
  | "finance"
  | "gst-credit"
  | "fuel"
  | "insurance"
  | "registration"
  | "maintenance"
  | "tyres"
  | "roadside"
  | "fee"
  | "fbt"
  | "refund"
  | "unknown";

export interface StatementRow {
  /** ISO date. */
  date: string;
  description: string;
  /** Signed: positive into the account, negative out of it. */
  amount: number;
  /** The running balance the statement printed, where it printed one. */
  balance: number | null;
  kind: RowKind;
}

export interface ParseResult {
  rows: StatementRow[];
  /** Lines that carried no date or no amount, kept so the page can say what
   *  it ignored rather than silently dropping part of somebody's statement. */
  skipped: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * A date at the start of a line, in any of the shapes these portals print.
 *
 * Returns null rather than guessing. A row whose date cannot be read is a row
 * that cannot be ordered, and an out-of-order ledger reconciles against the
 * wrong neighbour and reports breaks that are not there.
 */
export function matchDate(text: string): { date: string; length: number } | null {
  const t = text.trimStart();
  const lead = text.length - t.length;
  const at = (m: RegExpMatchArray, date: string) => ({ date, length: lead + m[0].length });

  // 11 September 2026 · 11 Sep 2026 · 11 Sep 26
  const words = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})/);
  if (words) {
    const m = MONTHS[words[2].slice(0, 3).toLowerCase()];
    if (m) {
      const y = Number(words[3]);
      return at(words, iso(y < 100 ? 2000 + y : y, m, Number(words[1])));
    }
  }
  // 2026-09-11
  const isoish = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoish) {
    return at(isoish, iso(Number(isoish[1]), Number(isoish[2]), Number(isoish[3])));
  }
  // 11/09/2026 — day first, which is what an Australian statement means.
  const slashed = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (slashed) {
    const y = Number(slashed[3]);
    return at(slashed, iso(y < 100 ? 2000 + y : y, Number(slashed[2]), Number(slashed[1])));
  }
  return null;
}

export function parseDate(text: string): string | null {
  return matchDate(text)?.date ?? null;
}

/**
 * Currency as these statements write it: $1,698.98 · -$218.25 · $-218.25 ·
 * ($218.25) · $ 1,698.98 · 1698.98 DR
 *
 * A minus sign counts only where it touches the figure or the dollar sign. It
 * used to be allowed a space, which meant a description ending in a separator
 * hyphen swallowed it: "Registration - 570.00" parsed as MINUS $570, turning a
 * payment out of the account into a payment into it. Statements are full of
 * " - " as punctuation and empty of "- 570.00" as a negative, so the space is
 * the thing that had to go.
 */
const MONEY = /\(?(?:-\$?|\$-?|\$\s)?\d[\d,]*\.\d{2}\)?(?:\s?(?:DR|CR))?/gi;

function parseMoney(token: string): number {
  const negative =
    /^\(/.test(token.trim()) || /-/.test(token) || /\bDR\b/i.test(token);
  const n = Number(token.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

/**
 * Turn pasted text into rows.
 *
 * Walks the lines and starts a new row at every date, gathering everything
 * until the next one. That handles both layouts a copy-paste produces without
 * needing to know which it got: one row per line, and one CELL per line, which
 * is what a browser gives you when a table is selected and copied.
 */
export function parseStatement(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const rows: StatementRow[] = [];
  const skipped: string[] = [];

  let group: string[] = [];
  let groupDate: string | null = null;
  /* How many characters of the first line the date took.
   *
   * The description used to be recovered by dropping the first three
   * whitespace-separated tokens if they parsed as a date — which is right for
   * "11 September 2026" and wrong for every other format, because "2026-09-11"
   * is one token and the rule ate two words of the description with it.
   * "Insurance - Reimbursement" came back as "Reimbursement", and the hyphen
   * made it look like a problem with hyphens. */
  let groupDateLength = 0;

  const flush = () => {
    if (groupDate == null) {
      const junk = group.join(" ").trim();
      if (junk) skipped.push(junk);
      group = [];
      return;
    }
    const joined = group.join("  ").trim();
    const tokens = joined.match(MONEY) ?? [];
    const amounts = tokens.map(parseMoney).filter((n) => Number.isFinite(n));
    if (amounts.length === 0) {
      skipped.push(joined);
      group = [];
      groupDate = null;
      groupDateLength = 0;
      return;
    }
    // Two figures means amount then balance; one means amount alone. The
    // balance is the last, because it is the rightmost column.
    const amount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : null;
    // Whatever is left once the date and the figures are removed. Exactly the
    // date: it is the only part of the line whose length we know.
    const description = joined
      .slice(groupDateLength)
      .replace(MONEY, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-–—|,]+|[\s\-–—|,]+$/g, "")
      .trim();
    rows.push({
      date: groupDate,
      description,
      amount,
      balance,
      kind: classify(description, amount),
    });
    group = [];
    groupDate = null;
    groupDateLength = 0;
  };

  for (const line of lines) {
    if (!line) continue;
    const d = matchDate(line);
    if (d) {
      flush();
      groupDate = d.date;
      groupDateLength = d.length;
    }
    group.push(line);
  }
  flush();

  /*
   * Oldest first, which is the order a running balance has to be read in.
   *
   * Sorting by date alone is not enough, and the real statement is what showed
   * it: these portals list newest first, and six GST credits shared a single
   * day. A stable sort keeps same-day rows in the order they were pasted —
   * which was newest first — so the balances inside that day ran backwards and
   * every one of them reported as a break.
   *
   * So the whole list is reversed first when the paste was newest-first, and
   * the sort then only has to move rows between days. Direction is read off
   * the dates rather than assumed, because some providers do print oldest
   * first and reversing those would recreate the same bug the other way up.
   */
  const firstDate = rows[0]?.date;
  const lastDate = rows[rows.length - 1]?.date;
  if (firstDate && lastDate && firstDate > lastDate) rows.reverse();
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, skipped };
}

/**
 * What a line is, from how it is described.
 *
 * Keyword matching rather than a provider-specific table: the words are
 * industry words and they survive rebrands, whereas a table keyed on a
 * provider's exact wording breaks the first time they change their template.
 * Order matters — GST is checked before everything, because "GST on Fuel" is a
 * credit rather than a fuel cost.
 */
export function classify(description: string, amount: number): RowKind {
  const d = description.toLowerCase();
  if (/\bgst\b/.test(d)) return "gst-credit";
  if (/payroll|salary|contribution|deduction|funds (from|received)|pay cycle/.test(d))
    return amount >= 0 ? "payroll" : "fbt";
  if (/lease|finance|financier|rental|repayment/.test(d)) return "finance";
  if (/insur/.test(d)) return "insurance";
  if (/regist|rego|ctp|green ?slip/.test(d)) return "registration";
  if (/mainten|servic|repair/.test(d)) return "maintenance";
  if (/tyre|tire/.test(d)) return "tyres";
  if (/roadside|rac[vqa]?\b|nrma|aanz/.test(d)) return "roadside";
  if (/fuel|petrol|diesel|charg|electric|energy|e-?toll/.test(d)) return "fuel";
  if (/fbt|ecm|employee contribution|post.?tax/.test(d)) return "fbt";
  if (/fee|admin|management|packaging/.test(d)) return "fee";
  if (/refund|payout|surplus|disburse/.test(d)) return "refund";
  return "unknown";
}

export interface LedgerBreak {
  row: StatementRow;
  expected: number;
  printed: number;
}

/**
 * Does the ledger add up?
 *
 * Each printed balance is a claim: the one above it, plus this line. Checking
 * it costs nothing and is the one thing a reader cannot do by eye across forty
 * rows. Rows without a printed balance are skipped rather than assumed.
 */
export function reconcile(rows: StatementRow[]): {
  breaks: LedgerBreak[];
  checked: number;
  openingBalance: number | null;
} {
  const withBalance = rows.filter((r) => r.balance != null);
  if (withBalance.length === 0) return { breaks: [], checked: 0, openingBalance: null };

  const opening = withBalance[0].balance! - withBalance[0].amount;
  const breaks: LedgerBreak[] = [];
  let prev = opening;
  for (const row of withBalance) {
    const expected = prev + row.amount;
    // Half a cent, so a statement that rounds its own display does not read as
    // broken.
    if (Math.abs(expected - row.balance!) > 0.005) {
      breaks.push({ row, expected, printed: row.balance! });
    }
    prev = row.balance!;
  }
  return { breaks, checked: withBalance.length, openingBalance: opening };
}

export interface StatementRead {
  rows: StatementRow[];
  from: string | null;
  to: string | null;
  /** Whole months the rows span, at least 1 — the divisor for a monthly rate. */
  months: number;
  openingBalance: number | null;
  closingBalance: number | null;
  /** Signed totals by kind, over the whole period. */
  totals: Record<RowKind, number>;
  inPerMonth: number;
  outPerMonth: number;
  /** Positive = the account is filling; negative = it is draining. */
  driftPerMonth: number;
  breaks: LedgerBreak[];
  findings: Finding[];
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const cents = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

const EMPTY_TOTALS = (): Record<RowKind, number> => ({
  payroll: 0, finance: 0, "gst-credit": 0, fuel: 0, insurance: 0, registration: 0,
  maintenance: 0, tyres: 0, roadside: 0, fee: 0, fbt: 0, refund: 0, unknown: 0,
});

/** Months between two ISO dates, at least one — a single month of rows still
 *  has a monthly rate, it is just measured over a short window. */
function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, (b - a) / (1000 * 60 * 60 * 24 * 30.44));
}

export function readStatement(rows: StatementRow[], config: EngineConfig): StatementRead {
  const findings: Finding[] = [];
  const totals = EMPTY_TOTALS();
  for (const r of rows) totals[r.kind] += r.amount;

  const from = rows[0]?.date ?? null;
  const to = rows[rows.length - 1]?.date ?? null;
  const months = from && to ? monthsBetween(from, to) : 1;
  const { breaks, checked, openingBalance } = reconcile(rows);
  const closingBalance = [...rows].reverse().find((r) => r.balance != null)?.balance ?? null;

  const inTotal = rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const outTotal = -rows.filter((r) => r.amount < 0).reduce((t, r) => t + r.amount, 0);
  const inPerMonth = inTotal / months;
  const outPerMonth = outTotal / months;

  /*
   * Does it add up?
   *
   * First, because everything below it is worthless if the ledger is not
   * internally consistent — and because a statement that reconciles is worth
   * saying out loud. It is the only reassuring finding this page produces, and
   * a page of nothing but warnings teaches people to stop reading.
   */
  if (checked > 1) {
    if (breaks.length === 0) {
      findings.push({
        key: "ledger-reconciles",
        severity: "ok",
        category: "Ledger",
        title: `All ${checked} balances add up`,
        detail: `Every running balance is the one above it plus that line's amount. That does not make the charges right, but it does mean nothing has been dropped or double-counted in the arithmetic.`,
      });
    } else {
      const first = breaks[0];
      findings.push({
        key: "ledger-breaks",
        severity: "critical",
        category: "Ledger",
        title: `${breaks.length} balance${breaks.length === 1 ? " does" : "s do"} not add up`,
        detail: `On ${first.row.date} the balance should be ${cents(first.expected)} after ${cents(first.row.amount)}, but the statement prints ${cents(first.printed)} — ${cents(Math.abs(first.printed - first.expected))} out. Either a line is missing from what was pasted, or the statement has an error.`,
        costOverTerm: Math.abs(first.printed - first.expected),
        question: `The running balance on ${first.row.date} doesn't follow from the line above it. Could you send the full transaction list for that period?`,
      });
    }
  }

  /*
   * The GST credits, which are the most misread line on these statements.
   *
   * They arrive as money in, so they look like income. They are not: they are
   * the GST on something already paid out of the same account, coming back
   * because the employer claims it. And because a lease rental is GST
   * inclusive, each credit against a rental is exactly a tenth of it — one
   * eleventh of the inclusive figure — which is how they can be recognised
   * with certainty rather than guessed at.
   */
  const gstRows = rows.filter((r) => r.kind === "gst-credit" && r.amount > 0);
  if (gstRows.length > 0) {
    const financeRows = rows.filter((r) => r.kind === "finance" && r.amount < 0);
    const rental = financeRows.length > 0 ? Math.abs(financeRows[0].amount) : null;
    const gstOnRental = rental != null ? rental - rental / (1 + config.gst.rate) : null;
    const matching =
      gstOnRental != null
        ? gstRows.filter((r) => Math.abs(r.amount - gstOnRental) < 0.02).length
        : 0;

    findings.push({
      key: "gst-credits",
      severity: "ok",
      category: "GST",
      title: `${money(totals["gst-credit"])} of GST credits came back into the account`,
      detail:
        `Not income — it is GST on money already spent out of this same account, returned because your employer claims it back. ` +
        (matching > 0 && rental != null
          ? `${matching} of them are ${cents(gstOnRental!)}, which is exactly the GST inside the ${cents(rental)} lease rental. That is the credit for one month's rental, so the count tells you how many months each batch covers.`
          : `Each one traces back to a payment above it.`),
    });

    /*
     * Late credits are the finding underneath the explanation.
     *
     * Several months' worth landing on one day means the account carried the
     * GST for those months: the user's own contributions were funding it, and
     * a balance that looked thin was thin for a reason nobody told them.
     */
    const byDay = new Map<string, number>();
    for (const r of gstRows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
    const lumps = [...byDay.entries()].filter(([, v]) => {
      const n = gstRows.filter((r) => byDay.has(r.date)).length;
      return n > 0 && v > 0;
    });
    const biggest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const countOnBiggestDay = gstRows.filter((r) => r.date === biggest[0]).length;
    if (lumps.length > 0 && countOnBiggestDay >= 3) {
      findings.push({
        key: "gst-credits-delayed",
        severity: "warn",
        category: "GST",
        // Credits, not months: on the real statement six landed together and
        // only five of them were a month's rental GST. Calling them months
        // states something the ledger does not say.
        title: `${countOnBiggestDay} GST credits arrived on one day`,
        detail: `${money(biggest[1])} of credits was posted on ${biggest[0]} in ${countOnBiggestDay} separate lines. Until then the account was short by that much — your contributions were covering GST the employer had already reclaimed. It is worth asking how often those credits are passed back, because between batches the balance looks worse than the lease actually is.`,
        costOverTerm: biggest[1],
        question: `The GST credits came through in one batch on ${biggest[0]}, covering several months. How often are they passed back to my account?`,
      });
    }
  }

  /*
   * Where the account is heading.
   *
   * The single question every one of these statements raises and none of them
   * answers. A balance means nothing on its own; a balance plus a direction
   * means everything, because it says whether a deduction is about to be
   * raised or whether money is piling up that belongs to the user.
   */
  const drift = (inPerMonth - outPerMonth);
  if (closingBalance != null && Math.abs(drift) > 20 && months >= 1.5) {
    const filling = drift > 0;
    findings.push({
      key: filling ? "account-filling" : "account-draining",
      severity: filling ? "ok" : "warn",
      category: "Balance",
      title: filling
        ? `The account is gaining about ${money(drift)} a month`
        : `The account is losing about ${money(Math.abs(drift))} a month`,
      detail: filling
        ? `${money(inPerMonth)} goes in and ${money(outPerMonth)} comes out. The balance is ${money(closingBalance)}. A surplus is your money — it is refunded when the lease ends, though it comes back through payroll and is taxed on the way, because it went in untaxed. A balance that keeps climbing means the budgets were set higher than the car actually needs.`
        : `${money(inPerMonth)} goes in and ${money(outPerMonth)} comes out, against a balance of ${money(closingBalance)}. At that rate it runs out in about ${Math.max(0, Math.round(closingBalance / Math.abs(drift)))} months, and the usual remedy is a deduction increase you did not choose. Worth asking now rather than being told later.`,
      costOverTerm: Math.abs(drift) * 12,
      question: filling
        ? `My balance is ${money(closingBalance)} and rising about ${money(drift)} a month. Can the budgets be reduced so I am not pre-paying more than the car needs?`
        : `My balance is ${money(closingBalance)} and falling about ${money(Math.abs(drift))} a month. What happens when it runs out, and what would the deduction have to become?`,
    });
  }

  // Anything we could not name, so the page never pretends to have read a line
  // it did not understand.
  const unknowns = rows.filter((r) => r.kind === "unknown");
  if (unknowns.length > 0) {
    findings.push({
      key: "unclassified-lines",
      severity: "ok",
      category: "Ledger",
      title: `${unknowns.length} line${unknowns.length === 1 ? "" : "s"} we could not categorise`,
      detail: `They are included in the balance and in the totals — ${unknowns
        .slice(0, 3)
        .map((r) => `"${r.description}"`)
        .join(", ")}${unknowns.length > 3 ? " and others" : ""}. If any of them is a fee, it is worth knowing what for.`,
    });
  }

  findings.sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, warn: 1, ok: 2 };
    return rank[a.severity] - rank[b.severity] || (b.costOverTerm ?? 0) - (a.costOverTerm ?? 0);
  });

  return {
    rows,
    from,
    to,
    months,
    openingBalance,
    closingBalance,
    totals,
    inPerMonth,
    outPerMonth,
    driftPerMonth: drift,
    breaks,
    findings,
  };
}
