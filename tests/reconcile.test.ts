import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { quoteFieldChecks } from "@/lib/au/quoteChecks";
import { annuityPayment } from "@/lib/au/novated";
import { applyQuoteEdit, leaseToQuote, newLease, newQuoteSpec, type Lease } from "@/lib/au/lease";

const config = DEFAULT_CONFIG;

const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const residualIncGst = residualExGst * 1.1;
const RATE = 6;

/** What the quote charges once a $990 fee is financed in at the stated rate. */
const feesFinanced = 990;
const chargedWithFee = annuityPayment(financed + feesFinanced, residualExGst, RATE, months);
/** The payment a given rate produces on the bare amount financed. */
const at = (rate: number) => annuityPayment(financed, residualExGst, rate, months);

const quote = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 55_000,
  amountFinanced: financed,
  residualIncGst,
  statedRatePct: RATE,
  lines: { finance: chargedWithFee },
  salary: 110_000,
  ...over,
});

/**
 * Checking what a provider said against what they charge.
 *
 * The decoder solves a rate and hands over a question; this is what happens
 * when the question gets answered. The answer is arithmetic, so it can be
 * tested rather than believed — which is the whole reason the field exists.
 */
describe("Reconciling a provider's explanation", () => {
  it("confirms an explanation that accounts for the gap", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    expect(d.reconciliation?.reconciles).toBe(true);
    expect(d.findings.some((f) => f.key === "explanation-reconciles")).toBe(true);
    expect(Math.abs(d.reconciliation!.unexplainedOverTerm)).toBeLessThan(months);
  });

  it("names what is left when the explanation falls short", () => {
    // They admit to $400 of a fee that is really $990.
    const d = decodeQuote(quote({ explainedFeesFinanced: 400 }), config);
    const f = d.findings.find((x) => x.key === "explanation-falls-short");
    expect(f?.severity).toBe("warn");
    expect(d.reconciliation!.unexplainedOverTerm).toBeGreaterThan(0);
    // The follow-up question carries the remaining figure, not a vague ask.
    expect(f?.question).toMatch(/remaining \$[\d,]+/);
  });

  it("says so when the explanation would cost more than they charge", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: 4_000 }), config);
    expect(d.reconciliation!.unexplainedOverTerm).toBeLessThan(0);
    expect(d.findings.some((f) => f.key === "explanation-overshoots")).toBe(true);
  });

  /**
   * The distinction the two fields exist for.
   *
   * A fee capitalised into the amount borrowed is amortised at the rate for
   * the whole term; the same money charged inside each payment is flat and
   * costs more. A provider says "there's a fee in there" for both, so putting
   * one in the wrong box has to produce a different answer — otherwise the
   * split is decoration.
   */
  it("treats a financed fee and a per-payment charge differently", () => {
    const asFinanced = decodeQuote(quote({ explainedFeesFinanced: 990 }), config).reconciliation!;
    const asPerPayment = decodeQuote(quote({ explainedFeesPerPayment: 990 }), config)
      .reconciliation!;
    expect(asPerPayment.expectedMonthly).toBeGreaterThan(asFinanced.expectedMonthly);
  });

  it("reads a per-payment charge at the quote's own frequency", () => {
    const monthly = decodeQuote(quote({ explainedFeesPerPayment: 20 }), config).reconciliation!;
    const weekly = decodeQuote(
      quote({ frequency: "weekly", lines: { finance: (chargedWithFee * 12) / 52 }, explainedFeesPerPayment: 20 }),
      config,
    ).reconciliation!;
    // $20 a week is more than $20 a month, so it must move the expectation more.
    expect(weekly.expectedMonthly - weekly.actualMonthly).toBeGreaterThan(
      monthly.expectedMonthly - monthly.actualMonthly,
    );
  });
});

/**
 * Reconciling is not endorsing.
 *
 * The risk of this feature is somebody entering the fees, seeing it balance,
 * and concluding the deal is fine — when the fees may be the problem. A clean
 * reconciliation has to price them too.
 */
describe("A complete explanation is not an endorsement", () => {
  it("prices the inclusions even when they account for everything", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(d.reconciliation!.feesOverTerm).toBeGreaterThan(0);
    // Priced in the prose rather than in costOverTerm — see below.
    expect(f.detail).toMatch(/They add \$[\d,]+ over the term/);
    expect(f.detail).toMatch(/separate thing to negotiate/);
  });

  it("does not call a reconciled quote good", () => {
    const f = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config).findings.find(
      (x) => x.key === "explanation-reconciles",
    )!;
    expect(`${f.title} ${f.detail}`).not.toMatch(/\bfair\b|\bgood deal\b|\breasonable\b/i);
    expect(f.detail).toMatch(/not the same as the inclusions being worth paying/);
  });

  it("questions a setup fee well above what is usual", () => {
    const big = config.lease.defaultEstablishmentFee * 3;
    const charged = annuityPayment(financed + big, residualExGst, RATE, months);
    const d = decodeQuote(
      quote({ explainedFeesFinanced: big, lines: { finance: charged } }),
      config,
    );
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(f.question).toMatch(/negotiable/);
  });
});

describe("It stays quiet until there is something to check", () => {
  it("says nothing before anyone has been asked", () => {
    expect(decodeQuote(quote(), config).reconciliation).toBeNull();
    expect(decodeQuote(quote(), config).findings.some((f) => f.key.startsWith("explanation-"))).toBe(
      false,
    );
  });

  it("needs a stated rate to reconcile against", () => {
    const d = decodeQuote(
      quote({ statedRatePct: undefined, explainedFeesFinanced: 990 }),
      config,
    );
    expect(d.reconciliation).toBeNull();
  });

  it("treats zero fees as no explanation rather than a complete one", () => {
    const d = decodeQuote(
      quote({ explainedFeesFinanced: 0, explainedFeesPerPayment: 0 }),
      config,
    );
    expect(d.reconciliation).toBeNull();
  });
});

describe("It survives being stored", () => {
  it("round-trips both figures through the lease", () => {
    const spec = newQuoteSpec("Provider A", months);
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, {
      ...quote({ explainedFeesFinanced: 990, explainedFeesPerPayment: 12 }),
    });
    expect(lease.quotes[0].explainedFeesFinanced).toBe(990);
    expect(lease.quotes[0].explainedFeesPerPayment).toBe(12);
    const back = leaseToQuote(lease, lease.quotes[0]);
    expect(back.explainedFeesFinanced).toBe(990);
    expect(back.explainedFeesPerPayment).toBe(12);
  });
});

/**
 * The same money, counted once.
 *
 * The decoder totals costOverTerm across findings to say how much avoidable
 * cost a quote holds. A reconciliation explains money the stated-rate finding
 * has already counted — so pricing it again inflated that total, reporting
 * $2,296 of avoidable cost for $1,148 of fees.
 */
describe("Explaining a cost does not add to it", () => {
  const total = (q: Quote) =>
    decodeQuote(q, config)
      .findings.filter((f) => f.costOverTerm != null)
      .reduce((sum, f) => sum + (f.costOverTerm ?? 0), 0);

  it("does not grow the avoidable-cost total when an explanation arrives", () => {
    const before = total(quote());
    const explained = total(quote({ explainedFeesFinanced: feesFinanced }));
    expect(explained).toBeCloseTo(before, 6);
  });

  it("does not grow it when the explanation falls short either", () => {
    const before = total(quote());
    expect(total(quote({ explainedFeesFinanced: 400 }))).toBeCloseTo(before, 6);
  });

  it("still puts the figures in front of the reader", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(f.detail).toMatch(/\$[\d,]+ over the term/);
  });

  /**
   * The cost moves with the finding rather than being dropped or doubled.
   *
   * The reconciliation replaces the bare-gap finding now, so it has to carry
   * that finding's cost — otherwise entering an explanation would make the
   * avoidable-cost total fall to nothing, which reads as the problem going
   * away when only the explanation for it arrived.
   */
  it("carries the gap's cost once it replaces the finding that did", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(f.costOverTerm).toBeCloseTo(d.statedRateGap!, 6);
  });
});

/**
 * The finding and the box that appears for it are one thing.
 *
 * The box arrives on the left when a stated rate disagrees with what is
 * charged; the finding explaining that disagreement sits on the right. Neither
 * mentioned the other, so the box read as another field to fill in rather than
 * the next step in something the reader was already doing.
 */
describe("The finding points at the box it opened", () => {
  const gap = () => quote({ explainedFeesFinanced: undefined });

  it("tells the reader where to put the answer, while it is still wanted", () => {
    const f = decodeQuote(gap(), config).findings.find(
      (x) => x.key === "stated-rate-understates",
    )!;
    expect(f.detail).toMatch(/Asked them what/);
    expect(f.detail).toMatch(/whether their answer accounts for this/);
  });

  /**
   * Replaced, not reworded.
   *
   * Once anything is entered, the reconciliation finding states the same gap
   * AND what accounts for it. Leaving the bare one beside it meant two
   * findings about one difference, carrying different figures, reading as two
   * problems — and the older of the two still pointing at a box the reader had
   * just used.
   */
  it("gives way to the reconciliation once anything is entered", () => {
    const after = decodeQuote(quote({ explainedFeesFinanced: 400 }), config).findings;
    expect(after.some((x) => x.key === "stated-rate-understates")).toBe(false);
    // And does not fall through to the branch that says the opposite. This is
    // the failure that reached the screen: a payment ABOVE the stated rate
    // reported as "below" it, because dropping one branch of an if/else chain
    // hands its cases to the next.
    expect(after.some((x) => x.key === "stated-rate-overstates")).toBe(false);
    expect(after.some((x) => x.key === "stated-rate-checks-out")).toBe(false);
    expect(after.some((x) => x.key === "explanation-falls-short")).toBe(true);
    // And nothing left on the page still points at the box.
    const said = after.flatMap((f) => [f.title, f.detail, f.question ?? ""]).join(" ");
    expect(said).not.toMatch(/Asked them what/);
  });

  it("says which box a figure belongs in when the explanation overshoots", () => {
    const f = decodeQuote(quote({ explainedFeesFinanced: 4_000 }), config).findings.find(
      (x) => x.key === "explanation-overshoots",
    )!;
    expect(f.detail).toMatch(/one added to what you borrow costs less/);
  });
});

/**
 * The warning under the payment has to move too.
 *
 * It is the first thing anybody reads, because it is under the box they just
 * typed in. Leaving it on the bare stated rate meant it went on calling the
 * payment wrong after the reader had entered the reason it wasn't — the panel
 * on the left explaining the gap, and the line under the field still denying
 * it.
 */
describe("The check under the finance payment", () => {
  it("flags the payment before anything has been explained", () => {
    const c = quoteFieldChecks(quote(), config).finance;
    expect(c).toBeTruthy();
    expect(c!.message).toMatch(/At the 6% they quoted, the finance would be/);
  });

  it("clears once the fees account for it", () => {
    expect(quoteFieldChecks(quote({ explainedFeesFinanced: feesFinanced }), config).finance)
      .toBeUndefined();
  });

  it("keeps flagging, in new words, while something is still missing", () => {
    const c = quoteFieldChecks(quote({ explainedFeesFinanced: 400 }), config).finance;
    expect(c).toBeTruthy();
    expect(c!.message).toMatch(/with what they have told you is in it/);
    expect(c!.message).toMatch(/still unaccounted for/);
  });

  it("moves the expectation by the fee, not by some other amount", () => {
    const bare = quoteFieldChecks(quote(), config).finance!.message;
    const part = quoteFieldChecks(quote({ explainedFeesFinanced: 400 }), config).finance!.message;
    const figure = (m: string) => Number(/would be \$([\d,]+)/.exec(m)![1].replace(/,/g, ""));
    // More borrowed at the same rate means a higher expected payment.
    expect(figure(part)).toBeGreaterThan(figure(bare));
  });

  it("counts a per-payment charge as well as a capitalised one", () => {
    const perPayment = quoteFieldChecks(quote({ explainedFeesPerPayment: 30 }), config).finance;
    const none = quoteFieldChecks(quote(), config).finance!;
    const figure = (m: string) => Number(/would be \$([\d,]+)/.exec(m)![1].replace(/,/g, ""));
    expect(figure(perPayment!.message)).toBeGreaterThan(figure(none.message));
  });

  // The field check and the findings have to agree about whether it adds up.
  it("agrees with the reconciliation finding", () => {
    const q = quote({ explainedFeesFinanced: feesFinanced });
    const d = decodeQuote(q, config);
    expect(d.reconciliation!.reconciles).toBe(true);
    expect(quoteFieldChecks(q, config).finance).toBeUndefined();

    const short = quote({ explainedFeesFinanced: 400 });
    expect(decodeQuote(short, config).reconciliation!.reconciles).toBe(false);
    expect(quoteFieldChecks(short, config).finance).toBeTruthy();
  });
});

/**
 * Two rates, both true, answering different questions.
 *
 * impliedRatePct solves the payment against the amount financed, so a fee
 * capitalised into the borrowing comes out looking like interest — which is
 * right, because to the person paying it there is no difference. It does not
 * move when fees are disclosed, and should not: what leaves the account is
 * unchanged by learning what it is made of.
 *
 * ratePaidOnBorrowingPct is the other half — fees put back where they belong,
 * leaving the cost of the money alone. Where the provider's explanation is
 * true, it lands on the rate they stated, and that is the check.
 */
describe("The rate on the money, against the rate on the payment", () => {
  it("lands on the stated rate when the explanation is true", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    expect(d.ratePaidOnBorrowingPct).toBeCloseTo(RATE, 1);
  });

  it("leaves the all-in rate alone — the payment has not changed", () => {
    const before = decodeQuote(quote(), config).impliedRatePct;
    const after = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config)
      .impliedRatePct;
    expect(after).toBeCloseTo(before!, 6);
  });

  it("puts the all-in rate above the rate on the money", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    expect(d.impliedRatePct!).toBeGreaterThan(d.ratePaidOnBorrowingPct!);
  });

  // A per-payment charge is not borrowed, so it comes off the payment rather
  // than onto the principal. Getting that backwards would flatter the rate.
  it("takes a per-payment charge off the payment, not onto the loan", () => {
    const perPayment = 20;
    const charged = annuityPayment(financed, residualExGst, RATE, months) + perPayment;
    const d = decodeQuote(
      quote({ lines: { finance: charged }, explainedFeesPerPayment: perPayment }),
      config,
    );
    expect(d.ratePaidOnBorrowingPct).toBeCloseTo(RATE, 1);
  });

  it("says nothing until somebody has said what the fees are", () => {
    expect(decodeQuote(quote(), config).ratePaidOnBorrowingPct).toBeNull();
  });

  // A short explanation leaves some of the fee counted as interest, so the
  // rate on the money sits between the stated rate and the all-in one.
  it("lands between the two when the explanation is partial", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: 400 }), config);
    expect(d.ratePaidOnBorrowingPct!).toBeGreaterThan(RATE);
    expect(d.ratePaidOnBorrowingPct!).toBeLessThan(d.impliedRatePct!);
  });
});

/**
 * No finding may describe the gap backwards.
 *
 * A payment above the stated rate reached the screen described as below it,
 * because suppressing one branch of an if/else chain hands its cases to the
 * next rather than removing them. Asserted as a property across a spread of
 * payments and explanations, rather than as the one case that happened to be
 * noticed.
 */
describe("Which way the gap runs", () => {
  const payments = [at(4), at(6), at(7.5), at(9.5), chargedWithFee];
  const explanations = [undefined, 0, 400, feesFinanced, 4_000];

  it("never says below when the payment is above, or the reverse", () => {
    for (const finance of payments) {
      for (const explainedFeesFinanced of explanations) {
        const q = quote({ lines: { finance }, explainedFeesFinanced });
        const d = decodeQuote(q, config);
        if (d.statedRateGap == null) continue;
        const said = d.findings.filter((f) => f.key.startsWith("stated-rate"));
        for (const f of said) {
          if (f.key === "stated-rate-overstates") {
            expect(d.statedRateGap, `${finance} / ${explainedFeesFinanced}`).toBeLessThan(0);
          }
          if (f.key === "stated-rate-understates") {
            expect(d.statedRateGap, `${finance} / ${explainedFeesFinanced}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("shows at most one story about the stated rate at a time", () => {
    for (const finance of payments) {
      for (const explainedFeesFinanced of explanations) {
        const d = decodeQuote(quote({ lines: { finance }, explainedFeesFinanced }), config);
        const stated = d.findings.filter((f) => f.key.startsWith("stated-rate")).length;
        const reconciled = d.findings.filter((f) => f.key.startsWith("explanation-")).length;
        expect(stated + reconciled, `${finance} / ${explainedFeesFinanced}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
