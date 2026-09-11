import Link from "next/link";
import Logo from "./Logo";
import Disclosures from "./Disclosures";
import { fmtCurrency, fmtDate } from "@/lib/au/format";
import { calculateLease, type LeaseInputs } from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * The printable report: everything the calculator shows, laid out for paper (or
 * "Save as PDF") so it can be taken to an employer, a lease provider or an
 * accountant. Server-rendered and deliberately chart-free — the tables carry the
 * argument, and they survive a black-and-white printer.
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
  const { package: pkg, fbt, finance, running, comparison, term } = r;
  const cycles = config.lease.payCyclesPerYear;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 print:px-0 print:py-0">
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-5">
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
          className="rounded border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-panel-2 print:hidden"
        >
          Back to your leases
        </Link>
      </div>

      <Section title="At a glance">
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure
            label={`Cost per ${cycles === 26 ? "fortnight" : "pay"}`}
            value={fmtCurrency(pkg.takeHomeReduction / cycles)}
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
            ["Vehicle price (drive-away, GST included)", fmtCurrency(finance.priceInclGst)],
            ["GST credit claimed by the financier", `− ${fmtCurrency(finance.gstCredit)}`],
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

      <Section title="Compared with buying it another way">
        <Table
          rows={[
            [`Novated lease — ${term.years} years`, fmtCurrency(comparison.lease.totalCost)],
            ["Car loan over the same term", fmtCurrency(comparison.loan.totalCost)],
            ["Paid in cash", fmtCurrency(comparison.cash.totalCost)],
            [
              comparison.savingVsLoan >= 0 ? "Lease saves against the loan" : "Lease costs more than the loan",
              fmtCurrency(Math.abs(comparison.savingVsLoan)),
            ],
          ]}
          emphasiseLast={1}
        />
        <p className="mt-3 text-sm text-subtle">
          Every column funds the same car for the same period and leaves{" "}
          {fmtCurrency(finance.residual)} still owing at the end, so only the funding
          differs. Running costs are included in all three — with GST where they are paid
          privately, without it where they are packaged.
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
