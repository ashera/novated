import type { EngineConfig } from "./config";
import { amortisationSchedule, type AmortisationPoint } from "./novated";
import { decodeQuote, type Finding } from "./quote";
import { leaseToQuote, lockedQuote, type Lease } from "./lease";
import { analyseLog, type LogAnalysis } from "./statementLog";

/**
 * A lease that is running, rather than one being chosen.
 *
 * Everything else in this engine answers "should I, and is this a good deal".
 * Once the contracts are signed those questions are settled and three others
 * take over, and they are the ones nobody can answer from a provider's portal:
 *
 * Are the payments the ones that were agreed? A rental is fixed for the term,
 * so every one of them is checkable against the quote — and the statement log
 * already holds what was actually taken.
 *
 * What is left owing? A lease does not pay the car off, so the balance lands
 * on the residual rather than on zero, and the early months barely move it.
 * People are routinely surprised by both, and both are arithmetic.
 *
 * Whose money is in the account, and how much? The reserve is the user's own
 * pay, held by somebody else, and the only place it is visible is a ledger
 * that does not explain itself.
 *
 * The lock is the boundary. A locked quote is already "this is the lease I am
 * having" — the payslip is built from it and the decoder refuses to edit it —
 * so it is the signal here too, rather than a second flag meaning almost the
 * same thing. What the lock does not carry is WHEN, and progress needs that,
 * so a missing commencement date is reported as the one thing outstanding
 * rather than guessed at.
 */

export interface PaymentProgress {
  /** Finance payments actually seen in the statement log. */
  made: number;
  /** What the quote says each one should be, monthly. */
  expected: number | null;
  /** Total paid to the financier so far. */
  paidToDate: number;
  /** Payments whose amount is not the quoted one. */
  offQuote: { date: string; amount: number }[];
  /** Months of the term, and how many have elapsed. */
  termMonths: number;
  monthsElapsed: number | null;
}

export interface Paydown {
  schedule: AmortisationPoint[];
  /** Where the lease is now, by payments made rather than by calendar — the
   *  schedule only moves when a payment is taken. */
  now: AmortisationPoint | null;
  /** The lump still owing at the end, GST included, which is what has to be
   *  found on the day. */
  residualPayable: number | null;
  ratePct: number | null;
}

export interface LeaseProgress {
  /** Null when no quote is locked — there is no lease to track yet. */
  active: boolean;
  commencementDate: string | null;
  payments: PaymentProgress | null;
  paydown: Paydown | null;
  reserve: LogAnalysis | null;
  findings: Finding[];
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const cents = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

/** Whole months between an ISO date and a reference, floored at zero. */
function monthsSince(from: string, today: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 0;
  const months =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth()) -
    (today.getUTCDate() < start.getUTCDate() ? 1 : 0);
  return Math.max(0, months);
}

export function leaseProgress(
  lease: Lease,
  config: EngineConfig,
  today: Date = new Date(),
): LeaseProgress {
  const spec = lockedQuote(lease);
  const findings: Finding[] = [];

  if (!spec) {
    return {
      active: false,
      commencementDate: null,
      payments: null,
      paydown: null,
      reserve: null,
      findings,
    };
  }

  const quote = leaseToQuote(lease, spec);
  const decode = decodeQuote(quote, config);
  const commencementDate = lease.scenario.commencementDate ?? null;
  const rows = lease.statement ?? [];
  const reserve = rows.length > 0 ? analyseLog(rows, config) : null;

  /*
   * The payments, against the one figure that cannot drift.
   *
   * A finance rental is fixed for the term — it is the whole point of a fixed
   * rate — so every payment in the ledger is a claim that can be checked
   * against the quote, and any that differs is worth a question. Compared in
   * monthly terms because that is what the schedule below is built in, and a
   * quote written fortnightly still amortises monthly.
   */
  const expected = decode.monthlyFinancePayment;
  const financeRows = rows.filter((r) => r.kind === "finance" && r.amount < 0);
  const paidToDate = financeRows.reduce((t, r) => t + Math.abs(r.amount), 0);
  const offQuote =
    expected != null
      ? financeRows
          .filter((r) => Math.abs(Math.abs(r.amount) - expected) > 1)
          .map((r) => ({ date: r.date, amount: Math.abs(r.amount) }))
      : [];

  const payments: PaymentProgress = {
    made: financeRows.length,
    expected,
    paidToDate,
    offQuote,
    termMonths: spec.termMonths,
    monthsElapsed: commencementDate ? monthsSince(commencementDate, today) : null,
  };

  /*
   * The paydown, driven by payments made rather than by the calendar.
   *
   * A schedule position taken from the date would drift away from the ledger
   * the first time a payment ran late or a deferral applied, and then the
   * balance shown would be a balance nobody owes. Counting the payments in the
   * log is the honest version: the debt moves when money moves.
   */
  let paydown: Paydown | null = null;
  if (
    decode.amountFinanced != null &&
    decode.residualExGst != null &&
    decode.impliedRatePct != null &&
    spec.termMonths > 0
  ) {
    const schedule = amortisationSchedule(
      decode.amountFinanced,
      decode.residualExGst,
      decode.impliedRatePct,
      spec.termMonths,
    );
    const at = Math.min(financeRows.length, spec.termMonths);
    paydown = {
      schedule,
      now: schedule[at] ?? null,
      residualPayable: decode.residualExGst * (1 + config.gst.rate),
      ratePct: decode.impliedRatePct,
    };
  }

  // ── What is worth saying ──────────────────────────────────────────────────

  if (!commencementDate) {
    findings.push({
      key: "no-commencement-date",
      severity: "warn",
      category: "Lease",
      title: "We don't know when the lease started",
      detail:
        "Set the start date on the lease and this can say how far through the term you are, how many payments should have been taken by now, and when the residual falls due. Without it the tracking below counts payments but cannot tell you whether any are missing.",
    });
  }

  if (payments.offQuote.length > 0 && expected != null) {
    const first = payments.offQuote[0];
    findings.push({
      key: "payment-off-quote",
      severity: "warn",
      category: "Payments",
      title: `${payments.offQuote.length} payment${payments.offQuote.length === 1 ? "" : "s"} differ from the quote`,
      detail: `The quote fixes the finance rental at ${cents(expected)} a month. On ${first.date} the ledger shows ${cents(first.amount)}. A fixed rate does not move, so either something else has been bundled into that line, or the payment covers a different period.`,
      costOverTerm: payments.offQuote.reduce((t, p) => t + Math.abs(p.amount - expected), 0),
      question: `My rental is ${cents(expected)}, but the payment on ${first.date} was ${cents(first.amount)}. What was the difference for?`,
    });
  }

  /*
   * Payments that should have been taken and were not.
   *
   * Only where the start date is known, and deliberately tolerant by one: a
   * payment taken on the 15th is a month behind a lease that commenced on the
   * 2nd, and calling that an arrears would be wrong every single month.
   */
  if (commencementDate && payments.monthsElapsed != null && expected != null) {
    const due = Math.min(payments.monthsElapsed, spec.termMonths);
    const short = due - payments.made;
    if (short > 1) {
      findings.push({
        key: "payments-missing",
        severity: "warn",
        category: "Payments",
        title: `${short} payments are not in the log`,
        detail: `The lease started on ${commencementDate}, so about ${due} rentals should have been taken by now, and the log holds ${payments.made}. Most likely the earlier statements have not been pasted in yet — the totals and the paydown below are short by whatever is missing.`,
      });
    }
  }

  if (paydown?.now && decode.amountFinanced != null) {
    const owed = paydown.now.balance;
    const retired = paydown.now.principalPaid;
    findings.push({
      key: "paydown-position",
      severity: "ok",
      category: "Paydown",
      title: `${money(owed)} still owing after ${payments.made} payment${payments.made === 1 ? "" : "s"}`,
      detail: `Of the ${money(decode.amountFinanced)} financed you have retired ${money(retired)} and paid ${money(paydown.now.interestPaid)} in interest. A lease does not pay the car off — this line lands on the residual, ${money(paydown.residualPayable ?? 0)} including GST, not on zero — and it moves slowly at first because the early payments are mostly interest.`,
    });
  }

  if (reserve) findings.push(...reserve.findings);

  findings.sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, warn: 1, ok: 2 };
    return rank[a.severity] - rank[b.severity] || (b.costOverTerm ?? 0) - (a.costOverTerm ?? 0);
  });

  return { active: true, commencementDate, payments, paydown, reserve, findings };
}
