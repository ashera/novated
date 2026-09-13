import Link from "next/link";
import Logo from "./Logo";
import Disclosures from "./Disclosures";
import PaydownChart from "./PaydownChart";
import { fmtCurrency, fmtCurrencyCents, fmtDate } from "@/lib/au/format";
import {
  amortisationSchedule,
  calculateLease,
  effectivePayCycle,
  isPreOwned,
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_NOUN,
  type LeaseInputs,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * The printable report: everything the calculator shows, laid out for paper (or
 * "Save as PDF") so it can be taken to an employer, a lease provider or an
 * accountant.
 *
 * Every figure here has a table behind it, because a table survives a
 * black-and-white printer and a chart may not. The paydown chart is the one
 * drawing, and it is drawn over its own numbers rather than instead of them —
 * the year-by-year table beneath it says the same thing to a fax machine.
 *
 * The payslip is the reason the report exists at all. The rest of this argues
 * the lease is worth doing; that table is what payroll is actually asked to
 * set up, so it is laid out exactly as it is on the calculator — same rows,
 * same rounding — and can be handed over as-is.
 */
export default function LeaseReport({
  inputs,
  config,
  scenarioName,
  preparedFor,
}: {
  inputs: LeaseInputs;
  config: EngineConfig;
  scenarioName: string;
  preparedFor?: string | null;
}) {
  const r = calculateLease(inputs, config);
  const { package: pkg, fbt, finance, running, comparison, term, payslip } = r;
  const payCycle = effectivePayCycle(inputs.payCycle, config);
  const noun = PAY_CYCLE_NOUN[payCycle];
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;

  // Rounded to the cent once, exactly as the calculator does it, so the report
  // a user prints and the screen they printed it from cannot disagree by a
  // cent — which is the sort of difference payroll would ask about.
  const n = PAY_CYCLES_PER_YEAR[payCycle];
  const per = (annual: number) => Math.round((annual / n) * 100) / 100;
  const netDrop = per(pkg.takeHomeBefore) - per(pkg.takeHomeAfter);
  const packagedCycle =
    per(finance.annualPayment) +
    (inputs.includeRunningCosts ? per(running.total) : 0) +
    per(adminFee) +
    per(finance.luxuryCarAdjustment) +
    per(fbt.fbtPayable);
  const taxDrop = packagedCycle - netDrop;
  const helpRose = payslip.after.help > payslip.before.help + 0.5;

  // The balance at each anniversary, and what the year in between did to it.
  const schedule = amortisationSchedule(
    finance.amountFinanced,
    finance.residual,
    inputs.interestRatePct,
    term.years * 12,
  );
  const years = Array.from({ length: term.years }, (_, i) => {
    const start = schedule[i * 12];
    const end = schedule[(i + 1) * 12];
    return {
      year: i + 1,
      interest: end.interestPaid - start.interestPaid,
      principal: start.balance - end.balance,
      balance: end.balance,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 print:px-0 print:py-0">
      {/* Stacked on a phone, same as the decoder's header: side by side, the
          heading gets two thirds of a 390px column and the back link wraps
          across three lines. It is print:hidden, so paper is unaffected. */}
      <div className="mb-6 flex flex-col items-start gap-3 border-b border-line pb-5 sm:flex-row sm:justify-between sm:gap-4">
        <div>
          <Logo />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{scenarioName}</h1>
          <p className="mt-1 text-sm text-muted">
            Novated lease summary · {config.financialYear} rules · prepared{" "}
            {fmtDate(new Date())}
            {preparedFor ? ` for ${preparedFor}` : ""}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap rounded border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-panel-2 print:hidden"
        >
          Back to your leases
        </Link>
      </div>

      <Section title="At a glance">
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure
            label={`Cost per ${PAY_CYCLE_NOUN[payCycle]}`}
            value={fmtCurrency(r.perPayCycle.takeHomeReduction)}
            note={`${fmtCurrency(pkg.takeHomeReduction)} a year off take-home pay`}
          />
          <Figure
            label="Tax saved each year"
            value={fmtCurrency(pkg.taxSaved)}
            note={`${(pkg.effectiveReliefRate * 100).toFixed(1)}% relief on the pre-tax deduction`}
          />
          <Figure
            label="Residual at the end"
            value={fmtCurrency(finance.residual)}
            note={`${finance.residualPct.toFixed(2)}% of the amount financed`}
          />
        </div>
      </Section>

      <Section title="The car and the lease">
        <Table
          rows={[
            ...(isPreOwned(inputs.condition)
              ? ([
                  [
                    inputs.condition === "demo" ? "Condition — ex-demonstrator" : "Condition — second-hand",
                    inputs.firstRegisteredDate
                      ? `First registered ${inputs.firstRegisteredDate}`
                      : "First registration date not given",
                  ],
                ] as [string, string][])
              : []),
            ["Vehicle price (drive-away, GST included)", fmtCurrency(finance.priceInclGst)],
            [
              inputs.purchasedFrom === "private"
                ? "GST credit — none, private sale"
                : "GST credit claimed by the financier",
              finance.gstCredit > 0 ? `− ${fmtCurrency(finance.gstCredit)}` : "—",
            ],
            ["Amount financed", fmtCurrency(finance.amountFinanced)],
            ...(finance.luxuryCarTax > 0
              ? ([["Luxury car tax included in the price", fmtCurrency(finance.luxuryCarTax)]] as [string, string][])
              : []),
            ["Term", `${inputs.termYears} year${inputs.termYears === 1 ? "" : "s"}`],
            ["Interest rate", `${inputs.interestRatePct}%`],
            ["Monthly lease payment", fmtCurrency(finance.monthlyPayment)],
            ["Total interest over the term", fmtCurrency(finance.totalInterest)],
            ["Residual payable at the end", fmtCurrency(finance.residual)],
          ]}
        />
      </Section>

      <Section title="How the finance is paid down">
        <PaydownChart result={r} config={config} />
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">Year</th>
              <th className="pb-2 text-right font-medium">Interest</th>
              <th className="pb-2 text-right font-medium">Off the car</th>
              <th className="pb-2 text-right font-medium">Still owing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {years.map((y) => (
              <tr key={y.year} className={y.year === term.years ? "font-semibold text-ink" : ""}>
                <td className="py-2 text-subtle">
                  {y.year === term.years ? `Year ${y.year} — end of the lease` : `Year ${y.year}`}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{fmtCurrency(y.interest)}</td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {fmtCurrency(y.principal)}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{fmtCurrency(y.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Fringe benefits tax">
        {fbt.exempt ? (
          <p className="text-sm text-subtle">
            <strong className="text-success-text">This car is exempt from FBT.</strong>{" "}
            {fbt.exemptReason} The whole package is therefore deducted from pre-tax salary
            with no employee contribution. The benefit is still reportable: a grossed-up
            value of {fmtCurrency(fbt.reportableFringeBenefit)} appears on the payment
            summary, which counts towards income tests such as the Medicare levy surcharge,
            HELP repayment income and family assistance — but not towards taxable income.
          </p>
        ) : (
          <>
            <Table
              rows={[
                ["Base value (GST-inclusive cost of the car)", fmtCurrency(fbt.baseValue)],
                [
                  `Statutory taxable value (${(config.fbt.statutoryRate * 100).toFixed(0)}% of base value)`,
                  fmtCurrency(fbt.taxableValue),
                ],
                ...(inputs.fbtMethod === "ecm"
                  ? ([
                      ["Employee contribution paid from post-tax salary", fmtCurrency(fbt.employeeContribution)],
                      ["FBT payable after the contribution", fmtCurrency(fbt.fbtPayable)],
                    ] as [string, string][])
                  : ([
                      [
                        `FBT payable (grossed up at ${config.fbt.grossUpType1}, taxed at ${(config.fbt.rate * 100).toFixed(0)}%)`,
                        fmtCurrency(fbt.fbtPayable),
                      ],
                      ["Reportable fringe benefit", fmtCurrency(fbt.reportableFringeBenefit)],
                    ] as [string, string][])),
              ]}
            />
            <p className="mt-3 text-sm text-subtle">
              {inputs.fbtMethod === "ecm"
                ? "Under the employee contribution method you pay the taxable value from post-tax salary, which reduces the FBT to nil. Those dollars get no tax relief — that is the trade for avoiding the FBT bill."
                : "With the employer paying the FBT, the grossed-up bill is added to your salary deduction instead. It is almost always dearer than contributing post-tax."}
            </p>
          </>
        )}
      </Section>

      <Section title="What comes out of your pay">
        <Table
          rows={[
            ["Lease payments", fmtCurrency(finance.annualPayment)],
            ...(inputs.includeRunningCosts
              ? ([
                  ["Fuel or charging", fmtCurrency(running.fuel)],
                  ["Servicing", fmtCurrency(running.servicing)],
                  ["Tyres", fmtCurrency(running.tyres)],
                  ["Registration and CTP", fmtCurrency(running.registration)],
                  ["Insurance", fmtCurrency(running.insurance)],
                  ["Roadside assistance", fmtCurrency(running.roadside)],
                ] as [string, string][])
              : []),
            [
              "Lease management fee",
              fmtCurrency(inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual),
            ],
            ["Deducted before tax", fmtCurrency(pkg.preTaxAnnual)],
            ["Deducted after tax", fmtCurrency(pkg.postTaxAnnual)],
          ]}
          emphasiseLast={2}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Figure label="Take-home now" value={fmtCurrency(pkg.takeHomeBefore)} note="Without the lease" />
          <Figure label="Take-home with the lease" value={fmtCurrency(pkg.takeHomeAfter)} note="After both deductions" />
          <Figure
            label="Net cost of the car"
            value={fmtCurrency(pkg.netAnnualCost)}
            note="Per year, tax relief counted"
          />
        </div>
      </Section>

      <Section title={`Your payslip, every ${noun}`}>
        <Payslip
          noun={noun}
          rows={[
            { label: "Gross pay", before: per(inputs.salary), after: per(inputs.salary) },
            {
              label: "Lease deduction, before tax",
              hint: "Shown as salary sacrifice",
              after: per(pkg.preTaxAnnual),
              negative: true,
            },
            {
              label: "Taxable pay",
              before: per(payslip.before.gross),
              after: per(payslip.after.gross),
              strong: true,
            },
            {
              label: "PAYG tax",
              before: per(payslip.before.incomeTax),
              after: per(payslip.after.incomeTax),
              negative: true,
            },
            {
              label: "Medicare levy",
              before: per(payslip.before.medicare),
              after: per(payslip.after.medicare),
              negative: true,
            },
            ...(payslip.before.help > 0 || payslip.after.help > 0
              ? [
                  {
                    label: "Study loan repayment",
                    hint: helpRose
                      ? "Rises: the reportable fringe benefit counts towards repayment income"
                      : undefined,
                    before: per(payslip.before.help),
                    after: per(payslip.after.help),
                    negative: true,
                  },
                ]
              : []),
            ...(pkg.postTaxAnnual > 0
              ? [
                  {
                    label: "Lease contribution, after tax",
                    hint: "The employee contribution that cancels the FBT",
                    after: per(pkg.postTaxAnnual),
                    negative: true,
                  },
                ]
              : []),
            {
              label: "Lands in your account",
              before: per(pkg.takeHomeBefore),
              after: per(pkg.takeHomeAfter),
              strong: true,
            },
          ]}
        />
        <p className="mt-3 text-sm text-subtle">
          {fmtCurrencyCents(packagedCycle)} a {noun} covers the car, everything packaged with it
          and the fees. Your tax falls by {fmtCurrencyCents(taxDrop)} because the pre-tax
          deduction comes off before tax is worked out, so what actually leaves your pay is{" "}
          {fmtCurrencyCents(netDrop)} a {noun}. That is the saving — it is not a discount on the
          car.
        </p>
        <p className="mt-2 text-sm text-subtle">
          These are the lines payroll has to set up. The first pay or two may differ: deductions
          usually start once the car is delivered, and providers commonly true up the budgets
          after the first few months.
        </p>
      </Section>

      <Section title="Compared with buying it another way">
        <Table
          rows={[
            [`Novated lease — ${term.years} years`, fmtCurrency(comparison.lease.totalCost)],
            ["Car loan over the same term", fmtCurrency(comparison.loan.totalCost)],
            [
              comparison.cash.foregone > 0 ? "Paid in cash, including interest forgone" : "Paid in cash",
              fmtCurrency(comparison.cash.totalCost),
            ],
            [
              comparison.savingVsLoan >= 0 ? "Lease saves against the loan" : "Lease costs more than the loan",
              fmtCurrency(Math.abs(comparison.savingVsLoan)),
            ],
          ]}
          emphasiseLast={1}
        />
        <p className="mt-3 text-sm text-subtle">
          Every column funds the same car for the same period and ends with you owning it
          outright — the lease and the loan settle the {fmtCurrency(comparison.residualSettled)}{" "}
          residual, the cash buyer paid it up front — so only the funding differs. Running costs
          are included in all three, with GST where they are paid privately and without it where
          they are packaged.
          {comparison.cash.foregone > 0 && (
            <>
              {" "}
              The cash column also carries {fmtCurrency(comparison.cash.foregone)} of interest
              forgone: money spent on a car is money not left in an offset account.
            </>
          )}
        </p>
      </Section>

      {r.warnings.length > 0 && (
        <Section title="Things to check">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-subtle">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      <Disclosures config={config} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 break-inside-avoid">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

interface PayslipRow {
  label: string;
  hint?: string;
  before?: number;
  after?: number;
  /** Show it the way a payslip does: a deduction, with a minus in front. */
  negative?: boolean;
  strong?: boolean;
}

/**
 * A payslip: the same figure before and after, side by side.
 *
 * Three columns rather than the report's usual two, because the whole point
 * of this table is the comparison — a novated lease changes a payslip in
 * three places at once, and only a "now" column makes that visible. Cents are
 * shown here and nowhere else in the report: this is the one page someone
 * checks against a real payslip.
 */
function Payslip({ rows, noun }: { rows: PayslipRow[]; noun: string }) {
  const cell = (v: number | undefined, negative?: boolean) =>
    v == null ? (
      <span className="text-muted">—</span>
    ) : (
      `${negative && v > 0 ? "− " : ""}${fmtCurrencyCents(v)}`
    );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className="pb-2 font-medium">Per {noun}</th>
          <th className="pb-2 text-right font-medium">Now</th>
          <th className="pb-2 text-right font-medium">With the lease</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.label} className={row.strong ? "font-semibold text-ink" : undefined}>
            <td className={`py-2 ${row.strong ? "" : "text-subtle"}`}>
              {row.label}
              {row.hint && (
                <span className="block text-[11px] font-normal text-muted">{row.hint}</span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums text-ink">
              {cell(row.before, row.negative)}
            </td>
            <td className="py-2 text-right tabular-nums text-ink">
              {cell(row.after, row.negative)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Table({
  rows,
  emphasiseLast = 0,
}: {
  rows: [string, string][];
  /** Bold the final N rows — the totals a reader's eye should land on. */
  emphasiseLast?: number;
}) {
  const boldFrom = rows.length - emphasiseLast;
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-line">
        {rows.map(([label, value], i) => (
          <tr key={label} className={i >= boldFrom ? "font-semibold text-ink" : ""}>
            <td className="py-2 text-subtle">{label}</td>
            <td className="py-2 text-right tabular-nums text-ink">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
