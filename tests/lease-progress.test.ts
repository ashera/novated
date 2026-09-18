import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { leaseProgress } from "@/lib/au/leaseProgress";
import { parseStatement } from "@/lib/au/statement";
import { mergeRows } from "@/lib/au/statementLog";
import {
  applyQuoteEdit,
  lockQuote,
  newLease,
  newQuoteSpec,
  type Lease,
} from "@/lib/au/lease";

const config = DEFAULT_CONFIG;
const TODAY = new Date("2026-09-19T00:00:00Z");

/** The ledger from a real portal, de-identified — the same fixture the
 *  statement reader was built against. */
const LEDGER = `
11 September 2026	Funds from Payroll	$1,698.98	$2,665.26
7 September 2026	Insurance - Reimbursement	-$218.25	$966.28
4 September 2026	GST Credits	$218.25	$1,184.53
2 September 2026	Insurance - Reimbursement	-$643.15	$966.28
31 August 2026	Maintenance - Reimbursement	-$797.90	$1,609.43
14 August 2026	Lease - Asset Finance Pty Ltd	-$1,602.81	$2,407.33
10 August 2026	GST Credits	$145.71	$4,010.14
10 August 2026	GST Credits	$145.71	$3,864.43
10 August 2026	GST Credits	$145.71	$3,718.72
10 August 2026	GST Credits	$145.71	$3,573.01
10 August 2026	GST Credits	$145.71	$3,427.30
10 August 2026	GST Credits	$179.62	$3,281.59
3 August 2026	Funds from Payroll	$1,698.98	$3,101.97
16 July 2026	Registration - Reimbursement	-$634.00	$1,402.99
16 July 2026	Registration - Reimbursement	-$570.00	$2,036.99
15 July 2026	Lease - Asset Finance Pty Ltd	-$1,602.81	$2,606.99
2 July 2026	Funds from Payroll	$1,698.98	$4,209.80
`;

/** A lease with the quote signed, and optionally some statement behind it. */
function signedLease(
  opts: { withLedger?: boolean; commencedOn?: string | null } = {},
): Lease {
  const withLedger = opts.withLedger ?? true;
  // null means "no date set", which a destructuring default cannot express:
  // `commencedOn: undefined` is a present property and the default replaced it.
  const commencedOn = opts.commencedOn === null ? undefined : (opts.commencedOn ?? "2026-07-01");
  const spec = newQuoteSpec("Provider A", 60);
  let lease: Lease = {
    ...newLease(),
    vehicle: { fuelType: "electric", price: 79_794, annualKm: 15_000 },
    scenario: { ...newLease().scenario, commencementDate: commencedOn, salary: 110_000 },
    quotes: [spec],
  };
  lease = applyQuoteEdit(lease, spec.id, {
    ...{
      frequency: "monthly" as const,
      fuelType: "electric" as const,
      termMonths: 60,
      amountFinanced: 78_018,
      residualIncGst: 24_141,
      lines: { finance: 1_602.81 },
    },
  });
  // Locking requires the calculator to already be modelling that quote — the
  // lock is a record of a decision, and a decision about figures the page is
  // not showing would not be one.
  lease = { ...lease, scenario: { ...lease.scenario, fromQuoteId: spec.id } };
  lease = lockQuote(lease, spec.id);
  if (withLedger) lease.statement = mergeRows([], parseStatement(LEDGER).rows).rows;
  return lease;
}

describe("Before anything is signed", () => {
  it("has no lease to track", () => {
    const p = leaseProgress(newLease(), config, TODAY);
    expect(p.active).toBe(false);
    expect(p.payments).toBeNull();
    expect(p.paydown).toBeNull();
    expect(p.findings).toEqual([]);
  });

  /** Choosing a quote is the decision. The dashboard follows the lock rather
   *  than a second flag meaning almost the same thing. */
  it("starts tracking once a quote is locked", () => {
    expect(leaseProgress(signedLease(), config, TODAY).active).toBe(true);
  });
});

describe("Tracking the payments", () => {
  it("counts what the ledger shows going to the financier", () => {
    const p = leaseProgress(signedLease(), config, TODAY).payments!;
    expect(p.made).toBe(2);
    expect(p.paidToDate).toBeCloseTo(3_205.62, 2);
    expect(p.expected).toBeCloseTo(1_602.81, 2);
  });

  /**
   * A fixed rental does not move, so every payment is checkable against the
   * quote. This is the one figure on a running lease that cannot legitimately
   * drift.
   */
  it("says nothing while every payment is the quoted one", () => {
    const keys = leaseProgress(signedLease(), config, TODAY).findings.map((f) => f.key);
    expect(keys).not.toContain("payment-off-quote");
  });

  it("names a payment that is not the quoted amount, and prices the difference", () => {
    const lease = signedLease();
    lease.statement = lease.statement!.map((r) =>
      r.kind === "finance" && r.date === "2026-08-14" ? { ...r, amount: -1_750 } : r,
    );
    const p = leaseProgress(lease, config, TODAY);
    const f = p.findings.find((x) => x.key === "payment-off-quote")!;
    expect(f.severity).toBe("warn");
    expect(p.payments!.offQuote).toHaveLength(1);
    expect(f.costOverTerm).toBeCloseTo(1_750 - 1_602.81, 2);
    expect(f.question).toMatch(/What was the difference for/);
  });

  it("notices payments that should have been taken and are not logged", () => {
    // Commenced a year before the ledger starts, so most rentals are missing.
    const lease = signedLease({ commencedOn: "2025-09-01" });
    const f = leaseProgress(lease, config, TODAY).findings.find((x) => x.key === "payments-missing")!;
    expect(f.severity).toBe("warn");
    expect(f.detail).toMatch(/have not been pasted in yet/);
  });

  /** A payment taken on the 15th is a month behind a lease that commenced on
   *  the 2nd. Calling that arrears would be wrong every month of the term. */
  it("tolerates being one payment behind the calendar", () => {
    const keys = leaseProgress(signedLease(), config, TODAY).findings.map((f) => f.key);
    expect(keys).not.toContain("payments-missing");
  });

  it("asks for the start date rather than guessing at one", () => {
    const lease = signedLease({ commencedOn: null });
    const p = leaseProgress(lease, config, TODAY);
    expect(p.commencementDate).toBeNull();
    expect(p.payments!.monthsElapsed).toBeNull();
    expect(p.findings.map((f) => f.key)).toContain("no-commencement-date");
    // And it still tracks what it can.
    expect(p.payments!.made).toBe(2);
  });
});

/**
 * The two things people are most often surprised by, and both are arithmetic:
 * the balance barely moves at first, and it never reaches zero.
 */
describe("Paying the lease down", () => {
  const p = leaseProgress(signedLease(), config, TODAY);

  it("starts the schedule at the amount financed and ends it at the residual", () => {
    const s = p.paydown!.schedule;
    expect(s[0].balance).toBeCloseTo(78_018, 0);
    expect(s.at(-1)!.balance).toBeCloseTo(24_141 / 1.1, 0);
  });

  /**
   * Position comes from payments made, not from the calendar. A date-driven
   * position drifts away from the ledger the first time a payment runs late,
   * and then shows a balance nobody owes.
   */
  it("moves with the payments rather than with the date", () => {
    expect(p.paydown!.now!.month).toBe(2);
    const noLedger = leaseProgress(signedLease({ withLedger: false }), config, TODAY);
    expect(noLedger.paydown!.now!.month).toBe(0);
    expect(noLedger.paydown!.now!.balance).toBeCloseTo(78_018, 0);
  });

  it("has barely dented the debt after two payments", () => {
    const now = p.paydown!.now!;
    expect(now.principalPaid).toBeLessThan(1_602.81 * 2);
    expect(now.interestPaid).toBeGreaterThan(0);
  });

  it("states the residual GST-inclusive, which is what has to be found", () => {
    expect(p.paydown!.residualPayable).toBeCloseTo(24_141, 0);
    expect(p.findings.find((f) => f.key === "paydown-position")!.detail).toMatch(
      /not on zero/,
    );
  });

  it("cannot run past the end of the term", () => {
    const lease = signedLease();
    const many = Array.from({ length: 80 }, (_, i) => ({
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
      description: "Lease - Asset Finance Pty Ltd",
      amount: -1_602.81,
      balance: null,
      kind: "finance" as const,
    }));
    lease.statement = many;
    const at = leaseProgress(lease, config, TODAY).paydown!.now!;
    expect(at.month).toBe(60);
  });
});

describe("The reserve the provider holds", () => {
  it("carries the statement log's own findings into the dashboard", () => {
    const keys = leaseProgress(signedLease(), config, TODAY).findings.map((f) => f.key);
    expect(keys).toContain("ledger-reconciles");
  });

  it("is absent until something has been pasted in", () => {
    expect(leaseProgress(signedLease({ withLedger: false }), config, TODAY).reserve).toBeNull();
  });

  it("reports the balance the ledger finished on", () => {
    expect(leaseProgress(signedLease(), config, TODAY).reserve!.balance).toBeCloseTo(2_665.26, 2);
  });
});
