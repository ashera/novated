"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TopBar, { type TopBarUser } from "./TopBar";
import QuoteField from "./QuoteField";
import Disclosures from "./Disclosures";
import { fmtCurrency } from "@/lib/au/format";
import { decodeQuote, type Quote, type QuoteFrequency, type FindingSeverity } from "@/lib/au/quote";
import type { EngineConfig } from "@/lib/au/config";
import type { FuelType } from "@/lib/au/novated";
import { track } from "@/lib/analytics";

/**
 * A worked example so the page opens showing what it does, rather than as an
 * empty form. Synthetic, but built to be representative: an $85,000 EV above the
 * car limit, financed at a rate the quote never mentions, with a padded
 * maintenance budget and an unexplained gap between the listed lines and the
 * salary deduction. Clearly labelled, and one click to clear.
 */
const EXAMPLE: Quote = {
  label: "Example quote",
  frequency: "fortnightly",
  vehiclePrice: 85_000,
  fuelType: "electric",
  amountFinanced: 78_666,
  residualIncGst: 24_342,
  termMonths: 60,
  salary: 130_000,
  annualKm: 15_000,
  statedPreTax: 900.19,
  statedPostTax: 0,
  lines: {
    finance: 650.19,
    energy: 24.23,
    maintenance: 22.0,
    tyres: 16.5,
    registration: 32.0,
    insurance: 115.0,
    managementFee: 19.0,
  },
};

const EMPTY: Quote = {
  frequency: "fortnightly",
  fuelType: "electric",
  termMonths: 60,
  lines: {},
};

const FUEL_TYPES: { key: FuelType; label: string }[] = [
  { key: "electric", label: "Electric" },
  { key: "petrol", label: "Petrol" },
  { key: "diesel", label: "Diesel" },
  { key: "hybrid", label: "Hybrid" },
  { key: "phev", label: "Plug-in hybrid" },
];

const SEVERITY_STYLE: Record<FindingSeverity, { chip: string; edge: string }> = {
  critical: { chip: "bg-danger-subtle text-danger-text", edge: "border-l-danger" },
  warn: { chip: "bg-warning-subtle text-warning-text", edge: "border-l-warning" },
  ok: { chip: "bg-success-subtle text-success-text", edge: "border-l-success" },
};

export default function QuoteDecoder({
  user,
  country,
  config,
  reviewDue = 0,
}: {
  user: TopBarUser | null;
  country?: string | null;
  config: EngineConfig;
  reviewDue?: number;
}) {
  const [quote, setQuote] = useState<Quote>(EXAMPLE);
  const [isExample, setIsExample] = useState(true);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof Quote>(key: K, value: Quote[K]) => {
    setQuote((q) => ({ ...q, [key]: value }));
    setIsExample(false);
  };
  const setLine = (key: keyof Quote["lines"], value: number | undefined) => {
    setQuote((q) => ({ ...q, lines: { ...q.lines, [key]: value } }));
    setIsExample(false);
  };

  const decode = useMemo(() => decodeQuote(quote, config), [quote, config]);
  const freqWord = quote.frequency === "monthly" ? "month" : "fortnight";

  const copyQuestions = async () => {
    const text = decode.questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track("Questions copied", { count: decode.questions.length });
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      /* clipboard blocked — the list is on screen to copy by hand */
    }
  };

  return (
    <>
      <TopBar user={user} country={country} reviewDue={reviewDue} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Decode your novated lease quote
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            Type in the figures from the quote a provider sent you. We&apos;ll work out the
            interest rate they didn&apos;t print, check every line against the market, and give you
            the questions to send back. Nothing is saved or shared.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          {/* ── The quote ──────────────────────────────────────────── */}
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">Your quote</h2>
                <button
                  type="button"
                  onClick={() => {
                    setQuote(EMPTY);
                    setIsExample(false);
                  }}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Clear
                </button>
              </div>

              <div className="mt-4">
                <span className="text-sm font-medium text-ink">Figures on your quote are per</span>
                <div className="mt-2 flex gap-1.5">
                  {(["fortnightly", "monthly"] as QuoteFrequency[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => set("frequency", f)}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                        quote.frequency === f
                          ? "border-accent bg-accent-subtle text-accent"
                          : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
                      }`}
                    >
                      {f === "fortnightly" ? "Fortnight" : "Month"}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  Providers publish one or the other, never both. Get this wrong and every figure
                  below is out by more than double.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The car</h2>
              <div className="mt-4 space-y-4">
                <QuoteField
                  label="Drive-away price"
                  alsoCalled={["Vehicle Price", "Drive Away Price"]}
                  value={quote.vehiclePrice}
                  onChange={(v) => set("vehiclePrice", v)}
                  placeholder="85,000"
                  hint="GST included, as advertised."
                />
                <div>
                  <span className="text-sm font-medium text-ink">Fuel type</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {FUEL_TYPES.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => set("fuelType", f.key)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                          quote.fuelType === f.key
                            ? "border-accent bg-accent-subtle text-accent"
                            : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The finance</h2>
              <p className="mt-1 text-xs text-muted">
                These three, plus the payment below, are what let us solve the interest rate.
              </p>
              <div className="mt-4 space-y-4">
                <QuoteField
                  label="Amount financed"
                  alsoCalled={["Vehicle Amount Financed", "Financed Amount"]}
                  value={quote.amountFinanced}
                  onChange={(v) => set("amountFinanced", v)}
                  placeholder="78,666"
                  hint="If it isn't stated, leave it — we can work it out from the price."
                />
                <QuoteField
                  label="Residual"
                  alsoCalled={["Residual Value", "Balloon"]}
                  value={quote.residualIncGst}
                  onChange={(v) => set("residualIncGst", v)}
                  placeholder="24,342"
                  hint="GST included — that's how it's normally quoted."
                />
                <QuoteField
                  label="Term"
                  prefix={null}
                  suffix="months"
                  value={quote.termMonths}
                  onChange={(v) => set("termMonths", v ?? 60)}
                  placeholder="60"
                />
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">What comes out of your pay</h2>
              <p className="mt-1 text-xs text-muted">
                Per {freqWord}, excluding GST — the way the quote lists them. Skip anything your
                quote doesn&apos;t show.
              </p>
              <div className="mt-4 space-y-4">
                <QuoteField
                  label="Finance payment"
                  alsoCalled={["Lease Payment", "Repayments", "Lease Rental"]}
                  value={quote.lines.finance}
                  onChange={(v) => setLine("finance", v)}
                  placeholder="650.19"
                />
                <QuoteField
                  label="Fuel or charging"
                  alsoCalled={["Power", "Electricity", "Fuel/Charging"]}
                  value={quote.lines.energy}
                  onChange={(v) => setLine("energy", v)}
                  placeholder="24.23"
                />
                <QuoteField
                  label="Servicing"
                  alsoCalled={["Maintenance"]}
                  value={quote.lines.maintenance}
                  onChange={(v) => setLine("maintenance", v)}
                  placeholder="22.00"
                />
                <QuoteField
                  label="Tyres"
                  value={quote.lines.tyres}
                  onChange={(v) => setLine("tyres", v)}
                  placeholder="16.50"
                />
                <QuoteField
                  label="Registration"
                  alsoCalled={["Registration + CTP"]}
                  value={quote.lines.registration}
                  onChange={(v) => setLine("registration", v)}
                  placeholder="32.00"
                />
                <QuoteField
                  label="Insurance"
                  alsoCalled={["Comprehensive Insurance"]}
                  value={quote.lines.insurance}
                  onChange={(v) => setLine("insurance", v)}
                  placeholder="115.00"
                />
                <QuoteField
                  label="Roadside assistance"
                  value={quote.lines.roadside}
                  onChange={(v) => setLine("roadside", v)}
                  placeholder="0.00"
                />
                <QuoteField
                  label="Management fee"
                  alsoCalled={["Lease Management", "Admin Fee"]}
                  value={quote.lines.managementFee}
                  onChange={(v) => setLine("managementFee", v)}
                  placeholder="19.00"
                />
                <QuoteField
                  label="Luxury car charge"
                  alsoCalled={["Luxury Car Adjustment"]}
                  value={quote.lines.luxuryCarAdjustment}
                  onChange={(v) => setLine("luxuryCarAdjustment", v)}
                  placeholder="—"
                  hint="Only on cars above the car limit. Many quotes fold it in without naming it."
                />
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The bottom line they quoted</h2>
              <p className="mt-1 text-xs text-muted">
                Per {freqWord}. This is what lets us check their own figures add up.
              </p>
              <div className="mt-4 space-y-4">
                <QuoteField
                  label="Pre-tax deduction"
                  alsoCalled={["Pre Tax Salary Contribution"]}
                  value={quote.statedPreTax}
                  onChange={(v) => set("statedPreTax", v)}
                  placeholder="900.19"
                />
                <QuoteField
                  label="Post-tax deduction"
                  alsoCalled={["Employee Contribution", "ECM"]}
                  value={quote.statedPostTax}
                  onChange={(v) => set("statedPostTax", v)}
                  placeholder="0.00"
                  hint="Nil on an FBT-exempt electric vehicle."
                />
                <QuoteField
                  label="Your gross salary"
                  prefix="$"
                  value={quote.salary}
                  onChange={(v) => set("salary", v)}
                  placeholder="130,000"
                />
                <QuoteField
                  label="Kilometres a year"
                  prefix={null}
                  suffix="km"
                  value={quote.annualKm}
                  onChange={(v) => set("annualKm", v)}
                  placeholder="15,000"
                  hint="Used to check the running-cost budgets against what the car needs."
                />
              </div>
            </section>
          </form>

          {/* ── What it means ──────────────────────────────────────── */}
          <div className="space-y-5">
            {isExample && (
              <p className="rounded-lg border border-accent-border bg-accent-subtle px-4 py-2.5 text-sm text-ink">
                <strong>This is an example quote</strong>, so you can see what the tool does.
                Start typing, or hit Clear, to use your own.
              </p>
            )}

            {/* The headline: the rate */}
            {decode.impliedRatePct != null ? (
              <section className="rounded-xl border border-line border-t-4 border-t-danger bg-panel p-5 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="text-5xl font-bold tabular-nums leading-none text-danger">
                    {decode.impliedRatePct.toFixed(2)}%
                  </span>
                  <div className="min-w-[16rem] flex-1">
                    <h2 className="text-lg font-semibold text-ink">
                      The interest rate on this lease
                    </h2>
                    <p className="mt-1 text-sm text-subtle">
                      Solved from the finance payment, the amount financed
                      {decode.financedWasDerived && " (which we worked out from the price)"}, the
                      residual and the term. Over {quote.termMonths / 12} years it costs{" "}
                      <strong>{fmtCurrency(decode.totalInterest ?? 0)}</strong> in interest
                      {decode.financeMargin != null && decode.financeMargin > 0 && (
                        <>
                          {" "}
                          — <strong>{fmtCurrency(decode.financeMargin)}</strong> more than the same
                          lease at {config.benchmarks.loanRatePct}%
                        </>
                      )}
                      .
                    </p>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-warning/40 bg-warning-subtle p-5">
                <h2 className="text-base font-semibold text-warning-text">
                  We can&apos;t work out the interest rate yet
                </h2>
                <p className="mt-1.5 text-sm text-warning-text">
                  {decode.rateBlockedBy ??
                    "Fill in the amount financed (or the drive-away price), the residual, the term and the finance payment."}
                </p>
              </section>
            )}

            {/* Findings */}
            {decode.findings.length > 0 && (
              <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
                <h2 className="text-base font-semibold text-ink">What we found</h2>
                <p className="mt-1 text-sm text-muted">
                  Ordered by what each one costs you over the term.
                </p>
                <ul className="mt-4 space-y-3">
                  {decode.findings.map((f) => (
                    <li
                      key={f.key}
                      className={`rounded-r-lg border border-l-4 border-line bg-panel-2 p-3.5 ${SEVERITY_STYLE[f.severity].edge}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[f.severity].chip}`}
                        >
                          {f.category}
                        </span>
                        <h3 className="flex-1 text-sm font-semibold text-ink">{f.title}</h3>
                        {f.costOverTerm != null && f.costOverTerm > 0 && (
                          <span className="text-sm font-semibold tabular-nums text-danger-text">
                            {fmtCurrency(f.costOverTerm)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-subtle">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Reconciliation */}
            {Object.keys(decode.annualLines).length > 0 && (
              <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
                <h2 className="text-base font-semibold text-ink">Does the quote add up?</h2>
                <p className="mt-1 text-sm text-muted">
                  Every line you entered, put on an annual footing.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="pb-2 font-medium">Line</th>
                        <th className="pb-2 text-right font-medium">Per {freqWord}</th>
                        <th className="pb-2 text-right font-medium">Per year</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {LINE_ORDER.filter((l) => decode.annualLines[l.key] != null).map((l) => (
                        <tr key={l.key}>
                          <td className="py-2 text-subtle">{l.label}</td>
                          <td className="py-2 text-right tabular-nums text-muted">
                            {(quote.lines[l.key] ?? 0).toFixed(2)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-ink">
                            {fmtCurrency(decode.annualLines[l.key])}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-ink">
                        <td className="py-2.5">Listed items add up to</td>
                        <td />
                        <td className="py-2.5 text-right tabular-nums">
                          {fmtCurrency(decode.annualPackageTotal)}
                        </td>
                      </tr>
                      {decode.annualStatedDeduction != null && (
                        <>
                          <tr className="font-semibold text-ink">
                            <td className="py-2.5">They deduct from your pay</td>
                            <td />
                            <td className="py-2.5 text-right tabular-nums">
                              {fmtCurrency(decode.annualStatedDeduction)}
                            </td>
                          </tr>
                          <tr
                            className={
                              Math.abs(decode.reconciliationGap ?? 0) > 50
                                ? "font-semibold text-danger-text"
                                : "font-semibold text-success-text"
                            }
                          >
                            <td className="py-2.5">
                              {Math.abs(decode.reconciliationGap ?? 0) > 50
                                ? "Unexplained difference"
                                : "Reconciles"}
                            </td>
                            <td />
                            <td className="py-2.5 text-right tabular-nums">
                              {fmtCurrency(decode.reconciliationGap ?? 0)}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Questions */}
            {decode.questions.length > 0 && (
              <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Send these back to them</h2>
                    <p className="mt-1 text-sm text-subtle">
                      Every one comes from a finding above. A provider who answers all of them
                      plainly is worth dealing with.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyQuestions}
                    className="rounded bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
                  >
                    {copied ? "Copied" : "Copy all"}
                  </button>
                </div>
                <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm text-ink marker:text-accent marker:font-semibold">
                  {decode.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                Model a lease from scratch
              </Link>
              <Link
                href="/how-it-works"
                className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                How a novated lease works
              </Link>
            </div>

            <Disclosures config={config} />
          </div>
        </div>
      </main>
    </>
  );
}

const LINE_ORDER: { key: keyof Quote["lines"]; label: string }[] = [
  { key: "finance", label: "Finance payment" },
  { key: "energy", label: "Fuel or charging" },
  { key: "maintenance", label: "Servicing" },
  { key: "tyres", label: "Tyres" },
  { key: "registration", label: "Registration" },
  { key: "insurance", label: "Insurance" },
  { key: "roadside", label: "Roadside assistance" },
  { key: "managementFee", label: "Management fee" },
  { key: "luxuryCarAdjustment", label: "Luxury car charge" },
];
