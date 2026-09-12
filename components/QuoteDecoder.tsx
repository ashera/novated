"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar, { type TopBarUser } from "./TopBar";
import QuoteField from "./QuoteField";
import Disclosures from "./Disclosures";
import { fmtCurrency } from "@/lib/au/format";
import {
  decodeQuote,
  quoteToLeaseInputs,
  type Quote,
  type QuoteFrequency,
  type FindingSeverity,
} from "@/lib/au/quote";
import { stashHandoff } from "@/lib/quoteHandoff";
import type { EngineConfig } from "@/lib/au/config";
import VehicleCard from "./VehicleCard";
import type { Vehicle } from "@/lib/au/vehicles";
import type { Provider } from "@/lib/au/providers";
import { track } from "@/lib/analytics";
import { useLease } from "./useLease";
import LeaseBar from "./LeaseBar";
import QuoteIdentity from "./QuoteIdentity";
import {
  applyQuoteEdit,
  withLeaseVehicle,
  defaultVehicle,
  leaseToQuote,
  newQuoteSpec,
  type Lease,
} from "@/lib/au/lease";

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

const FREQ_WORD: Record<QuoteFrequency, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};

const SEVERITY_STYLE: Record<FindingSeverity, { chip: string; edge: string }> = {
  critical: { chip: "bg-danger-subtle text-danger-text", edge: "border-l-danger" },
  warn: { chip: "bg-warning-subtle text-warning-text", edge: "border-l-warning" },
  ok: { chip: "bg-success-subtle text-success-text", edge: "border-l-success" },
};

export default function QuoteDecoder({
  user,
  country,
  config,
  catalogue,
  providers,
  reviewDue = 0,
}: {
  user: TopBarUser | null;
  country?: string | null;
  config: EngineConfig;
  /** The vehicle picker's options, read from the database by the page. */
  catalogue: Vehicle[];
  /** Approved lease providers, for the "who quoted it" suggestions. */
  providers: Provider[];
  reviewDue?: number;
}) {
  const store = useLease(Boolean(user));
  const { lease } = store;
  // The lease card links here with the quote it wants opened.
  const requestedQuoteId = useSearchParams().get("quote");
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(requestedQuoteId);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  // Which quote are we decoding? The lease's first, unless one was chosen.
  const activeSpec =
    lease.quotes.find((q) => q.id === activeQuoteId) ?? lease.quotes[0] ?? null;
  /**
   * A locked quote is a decision, not a draft.
   *
   * It is the record of what a provider actually sent and what the user chose
   * on that basis, and the payslip on the lease page is built from it — so
   * editing it here would quietly move the ground under a decision made
   * somewhere else. Read-only until they unlock it where they locked it.
   */
  const readOnly = Boolean(activeSpec && lease.lockedQuoteId === activeSpec.id);
  // A worked example is only right for someone who has told us nothing yet.
  // Once they have described a car, showing the example's car instead would
  // hide the very thing the lease exists to share — and showing the example's
  // FIGURES against their car would look like their numbers.
  const untouched =
    !lease.vehicle.vehicleId && lease.vehicle.price === defaultVehicle().price;
  const isExample = lease.quotes.length === 0 && untouched;
  const blankAgainstTheirCar = lease.quotes.length === 0 && !untouched;

  const quote: Quote = isExample
    ? EXAMPLE
    : blankAgainstTheirCar
      ? leaseToQuote(lease, newQuoteSpec("Your quote"))
      : leaseToQuote(lease, activeSpec!);

  /** Any edit writes back through the lease, splitting the car onto the parent
   *  and the rest onto the quote — which is how the two tools stay in step.
   *
   *  The car itself always comes from the lease, never from what is on screen.
   *  That matters for the example: it is priced at $85,000 to make a point,
   *  and the first keystroke used to copy that price onto the lease as though
   *  the user had chosen it. Harmless when the car was editable here; not
   *  harmless now, when the page shows it as settled and offers no way to
   *  correct it. Delivery is the exception — it belongs to the quote. */
  const setQuote = (fn: (q: Quote) => Quote) => {
    const next = fn(quote);
    store.update((l) => {
      const fromLease = (q: Quote) => withLeaseVehicle(l, q);
      if (isExample || blankAgainstTheirCar) {
        const spec = newQuoteSpec(next.label ?? "My quote");
        const seeded: Lease = { ...l, quotes: [...l.quotes, spec] };
        setActiveQuoteId(spec.id);
        return applyQuoteEdit(seeded, spec.id, fromLease(next));
      }
      return applyQuoteEdit(l, activeSpec!.id, fromLease(next));
    });
  };
  const set = <K extends keyof Quote>(key: K, value: Quote[K]) =>
    setQuote((q) => ({ ...q, [key]: value }));
  const setLine = (key: keyof Quote["lines"], value: number | undefined) =>
    setQuote((q) => ({ ...q, lines: { ...q.lines, [key]: value } }));

  const decode = useMemo(() => decodeQuote(quote, config), [quote, config]);

  // What the amount financed should be, given the price: the financier claims
  // the GST back, capped at the car limit. Shown beside the field so the pair
  // explains itself rather than needing to be explained.
  const derivedFinanced = useMemo(() => {
    if (!quote.vehiclePrice) return null;
    const creditable = Math.min(quote.vehiclePrice, config.gst.carLimit);
    return quote.vehiclePrice - (creditable - creditable / (1 + config.gst.rate));
  }, [quote.vehiclePrice, config]);
  const freqWord = FREQ_WORD[quote.frequency];




  /** Hand this quote to the calculator, so "is it worth it at all?" costs a
   *  click rather than re-typing everything. */
  const modelIt = () => {
    stashHandoff({
      inputs: quoteToLeaseInputs(quote, decode, config),
      label: quote.label?.trim() || "your quote",
      impliedRatePct: decode.impliedRatePct,
      // Absent for the worked example, which is nobody's saved quote.
      quoteId: activeSpec?.id,
    });
    track("Quote handed to calculator", {
      rate: decode.impliedRatePct == null ? "unsolved" : decode.impliedRatePct.toFixed(2),
    });
    router.push("/?from=quote");
  };

  // What to say next depends on what we found — a fair quote and a poor one
  // deserve different sentences, and a fixed one would ring false for both.
  const nextStepCopy = (() => {
    const rate = decode.impliedRatePct;
    const critical = decode.findings.filter((f) => f.severity === "critical").length;
    const costly = decode.findings
      .filter((f) => f.costOverTerm != null)
      .reduce((sum, f) => sum + (f.costOverTerm ?? 0), 0);
    if (rate == null) return "";
    if (critical === 0 && costly < 2_000) {
      return "Nothing here looks out of line. The remaining question is whether a novated lease beats simply buying the car — which depends on your tax rate, not on this provider.";
    }
    if (critical > 0) {
      return `There is about ${fmtCurrency(costly)} of avoidable cost in this quote. Worth fixing before you sign — but also worth knowing whether a lease still beats buying the car outright, even at these numbers.`;
    }
    return "A few things here are worth pushing back on. Either way, the bigger question is whether a lease beats buying the car outright at your tax rate.";
  })();

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
        {/* The way back. This page is only ever reached from Your leases, so it
            needs a visible return — the browser's back button is not an
            interface. */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Decode your novated lease quote
            </h1>
            <p className="mt-1.5 text-sm text-subtle">
              {readOnly ? (
                <>
                  The figures from this quote as they were transcribed, and what we found in
                  them — the interest rate it doesn&apos;t print, every line against the market,
                  and the questions worth sending back.
                </>
              ) : (
                <>
                  Type in the figures from the quote a provider sent you. We&apos;ll work out the
                  interest rate they didn&apos;t print, check every line against the market, and
                  give you the questions to send back. Keep more than one and you can put them
                  side by side.
                </>
              )}
            </p>
          </div>
          <Link
            href="/"
            className="mt-1 shrink-0 whitespace-nowrap rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition hover:border-accent hover:text-accent"
          >
            ← Your leases
          </Link>
        </div>

        {/* Said before anything else, because every field below is frozen and a
            page that simply refuses to type is a page that looks broken. It
            also has to say where to undo it: the lock was made somewhere else,
            so this page cannot be the one to release it. */}
        {readOnly && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/40 bg-success-subtle px-4 py-3">
            <p className="text-sm text-success-text">
              <strong>This quote is locked in.</strong> It&apos;s the one you&apos;ve settled on,
              so it&apos;s shown as it was — to change anything, unlock it on Your leases first.
            </p>
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap rounded bg-success px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Unlock on Your leases
            </Link>
          </div>
        )}

        {store.adopted > 0 && (
          <p className="mb-5 rounded-lg border border-success/40 bg-success-subtle px-4 py-2.5 text-sm text-success-text">
            Moved {store.adopted} lease{store.adopted === 1 ? "" : "s"} from this browser onto your
            account. They&apos;ll follow you to any device now.
          </p>
        )}

        <div className="mb-6">
          <VehicleCard
            header={
              <div className="space-y-3">
                <LeaseBar store={store} signedIn={Boolean(user)} readOnly />
                <div className="border-t border-line pt-3">
                  <QuoteIdentity
                    label={quote.label ?? ""}
                    onLabel={(v) => set("label", v)}
                    frequency={quote.frequency}
                    onFrequency={(f) => set("frequency", f)}
                    providers={providers}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            }
            readOnlyVehicle
            changeHref="/"
            catalogue={catalogue}
            vehicleId={quote.vehicleId}
            onVehicle={(v) =>
              setQuote((q) => ({
                ...q,
                vehicleId: v?.id,
                consumptionPer100km: v?.consumption,
                fuelType: v?.fuelType ?? q.fuelType,
              }))
            }
            fuelType={quote.fuelType}
            onFuelType={(f) => set("fuelType", f)}
            price={quote.vehiclePrice}
            onPrice={(v) => set("vehiclePrice", v)}
            customMake={lease.vehicle.make}
            customModel={lease.vehicle.model}
            customBodyType={lease.vehicle.bodyType}
            consumption={quote.consumptionPer100km}
            onRoadCosts={lease.vehicle.onRoadCosts}
            config={config}
            condition={lease.vehicle.condition}
            firstRegisteredDate={lease.vehicle.firstRegisteredDate}
            firstRetailPrice={lease.vehicle.firstRetailPrice}
            purchasedFrom={lease.vehicle.purchasedFrom}
            annualKm={quote.annualKm}
            onAnnualKm={(v) => set("annualKm", v)}
            state={quote.state}
            onState={(st) => set("state", st)}
            firstHeldDate={quote.firstHeldDate}
            onFirstHeldDate={readOnly ? undefined : (d) => set("firstHeldDate", d)}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          {/* ── The quote ──────────────────────────────────────────── */}
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The finance</h2>
              <p className="mt-1 text-xs text-muted">
                These, plus the payment below, are what let us solve the interest rate.
              </p>
              <div className="mt-4 space-y-4">
                {/* The relationship between the two, spelled out with their own
                    numbers — this pair is the most common point of confusion. */}
                <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                  {derivedFinanced != null ? (
                    <>
                      The financier buys the car and claims the GST back, so the lease is written
                      over <strong className="text-ink">less</strong> than the{" "}
                      {fmtCurrency(quote.vehiclePrice!)} price above. Expect about{" "}
                      <strong className="text-ink">{fmtCurrency(derivedFinanced)}</strong>{" "}
                      ({fmtCurrency(quote.vehiclePrice! - derivedFinanced)} of GST comes off).
                    </>
                  ) : (
                    <>
                      The financier claims the GST back on the car, so the amount financed is
                      always <strong className="text-ink">less</strong> than the price. Set the
                      car&apos;s price on the lease and we&apos;ll show you what to expect.
                    </>
                  )}
                </div>

                <QuoteField
                  readOnly={readOnly}
                  label="Amount financed"
                  alsoCalled={["Vehicle Amount Financed", "Financed Amount"]}
                  value={quote.amountFinanced}
                  onChange={(v) => set("amountFinanced", v)}
                  placeholder={derivedFinanced != null ? Math.round(derivedFinanced).toLocaleString("en-AU") : "78,666"}
                  hint={
                    derivedFinanced != null
                      ? "Leave blank and we'll use the figure shown. Not the same as a “base value” — that's for FBT."
                      : "Only if your quote states it. Not the same as a “base value” — that's for FBT."
                  }
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Residual"
                  alsoCalled={["Residual Value", "Balloon"]}
                  value={quote.residualIncGst}
                  onChange={(v) => set("residualIncGst", v)}
                  placeholder="24,342"
                  hint="GST included — that's how it's normally quoted."
                />
                <QuoteField
                  readOnly={readOnly}
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
                  readOnly={readOnly}
                  label="Finance payment"
                  alsoCalled={["Lease Payment", "Repayments", "Lease Rental"]}
                  value={quote.lines.finance}
                  onChange={(v) => setLine("finance", v)}
                  placeholder="650.19"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Fuel or charging"
                  alsoCalled={["Power", "Electricity", "Fuel/Charging"]}
                  value={quote.lines.energy}
                  onChange={(v) => setLine("energy", v)}
                  placeholder="24.23"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Servicing"
                  alsoCalled={["Maintenance"]}
                  value={quote.lines.maintenance}
                  onChange={(v) => setLine("maintenance", v)}
                  placeholder="22.00"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Tyres"
                  value={quote.lines.tyres}
                  onChange={(v) => setLine("tyres", v)}
                  placeholder="16.50"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Registration"
                  alsoCalled={["Registration + CTP"]}
                  value={quote.lines.registration}
                  onChange={(v) => setLine("registration", v)}
                  placeholder="32.00"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Insurance"
                  alsoCalled={["Comprehensive Insurance"]}
                  value={quote.lines.insurance}
                  onChange={(v) => setLine("insurance", v)}
                  placeholder="115.00"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Roadside assistance"
                  value={quote.lines.roadside}
                  onChange={(v) => setLine("roadside", v)}
                  placeholder="0.00"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Management fee"
                  alsoCalled={["Lease Management", "Admin Fee"]}
                  value={quote.lines.managementFee}
                  onChange={(v) => setLine("managementFee", v)}
                  placeholder="19.00"
                />
                <QuoteField
                  readOnly={readOnly}
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
                  readOnly={readOnly}
                  label="Pre-tax deduction"
                  alsoCalled={["Pre Tax Salary Contribution"]}
                  value={quote.statedPreTax}
                  onChange={(v) => set("statedPreTax", v)}
                  placeholder="900.19"
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Post-tax deduction"
                  alsoCalled={["Employee Contribution", "ECM"]}
                  value={quote.statedPostTax}
                  onChange={(v) => set("statedPostTax", v)}
                  placeholder="0.00"
                  hint="Nil on an FBT-exempt electric vehicle."
                />
                <QuoteField
                  readOnly={readOnly}
                  label="Your gross salary"
                  prefix="$"
                  value={quote.salary}
                  onChange={(v) => set("salary", v)}
                  placeholder="130,000"
                  hint="Before tax, and not counting employer super — whatever the quote was priced on."
                />
              </div>
            </section>
          </form>

          {/* ── What it means ──────────────────────────────────────── */}
          <div className="space-y-5">
            {isExample && (
              <p className="rounded-lg border border-accent-border bg-accent-subtle px-4 py-2.5 text-sm text-ink">
                <strong>This is an example quote</strong>, so you can see what the tool does.
                Start typing to use your own.
              </p>
            )}
            {blankAgainstTheirCar && (
              <p className="rounded-lg border border-accent-border bg-accent-subtle px-4 py-2.5 text-sm text-ink">
                <strong>Ready for your first quote on this car.</strong> Type in the figures from
                the document a provider sent you and we&apos;ll take it apart.
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

            {decode.impliedRatePct != null && (
              <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
                <h2 className="text-base font-semibold text-ink">So what now?</h2>
                <p className="mt-1.5 text-sm text-subtle">{nextStepCopy}</p>
                <button
                  type="button"
                  onClick={modelIt}
                  className="mt-4 rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
                >
                  See what this lease saves you
                </button>
                <p className="mt-2 text-xs text-muted">
                  Opens the calculator already filled in from this quote — your salary, the car,
                  the term, and the {decode.impliedRatePct.toFixed(2)}% we just solved.
                </p>
              </section>
            )}

            {/* Nothing to "save" any more — the lease saves itself as you type. */}
            <div className="flex flex-wrap items-center gap-3">
              {lease.quotes.length > 1 && (
                <Link
                  href="/compare"
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
                >
                  Compare {lease.quotes.length} quotes
                </Link>
              )}
              <Link
                href="/"
                className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                Model this lease from scratch
              </Link>
              <Link
                href="/how-it-works"
                className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                How a novated lease works
              </Link>
            </div>

            {!user && !isExample && (
              <p className="text-sm text-muted">
                This lease is kept in this browser.{" "}
                <Link href="/signup" className="font-medium text-accent hover:underline">
                  Create an account
                </Link>{" "}
                and it&apos;ll follow you to any device.
              </p>
            )}

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
