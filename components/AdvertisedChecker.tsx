"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkAdvertised, type AdvertisedAd } from "@/lib/au/advertised";
import type { EngineConfig } from "@/lib/au/config";
import type { FuelType } from "@/lib/au/novated";
import { defaultInputs } from "@/lib/au/novated";
import type { Finding, FindingSeverity } from "@/lib/au/quote";
import { fmtCurrency } from "@/lib/au/format";
import { stashHandoff } from "@/lib/quoteHandoff";
import { track } from "@/lib/analytics";

/**
 * The ad in the letterbox, taken apart.
 *
 * Somebody arriving here is holding a piece of paper, not a quote. They have a
 * weekly figure, maybe a savings claim, and a footnote in six-point type. So
 * the form asks for exactly what is printed on the page in front of them and
 * nothing else — the two optional questions sit below a divider and the page
 * works without them.
 *
 * It computes as you type, like the rest of the site, because there is no step
 * to wait for and a "Calculate" button on a four-field form is a stall rather
 * than a feature.
 */

const TONE: Record<FindingSeverity, { wrap: string; chip: string }> = {
  critical: { wrap: "border-danger/40 bg-danger-subtle", chip: "bg-danger-subtle text-danger-text" },
  warn: { wrap: "border-warning bg-warning-subtle", chip: "bg-warning-subtle text-warning-text" },
  ok: { wrap: "border-line bg-panel", chip: "bg-accent-subtle text-accent" },
};

function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-lg border border-line bg-panel px-3 py-2">
        {prefix && <span className="text-sm text-muted">{prefix}</span>}
        <input
          type="number"
          step="any"
          inputMode="decimal"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-full bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export default function AdvertisedChecker({ config }: { config: EngineConfig }) {
  const router = useRouter();

  // Seeded with the assumptions these ads almost always use, so the form is
  // answerable from the footnote rather than from knowledge.
  const [weeklyCost, setWeeklyCost] = useState<number | undefined>(undefined);
  const [claimedSaving, setClaimedSaving] = useState<number | undefined>(undefined);
  const [footnoteSalary, setFootnoteSalary] = useState<number | undefined>(85_000);
  const [termYears, setTermYears] = useState<number | undefined>(5);
  const [annualKm, setAnnualKm] = useState<number | undefined>(15_000);
  const [fuelType, setFuelType] = useState<FuelType>("electric");
  const [yourSalary, setYourSalary] = useState<number | undefined>(undefined);
  const [knownDriveAway, setKnownDriveAway] = useState<number | undefined>(undefined);

  const ad: AdvertisedAd | null =
    weeklyCost != null && weeklyCost > 0 && footnoteSalary != null && termYears != null && annualKm != null
      ? {
          weeklyCost,
          claimedSaving,
          footnoteSalary,
          termYears,
          annualKm,
          fuelType,
          yourSalary,
          knownDriveAway,
        }
      : null;

  const result = useMemo(() => (ad ? checkAdvertised(ad, config) : null), [ad, config]);

  const toCalculator = () => {
    if (!result?.impliedDriveAway || !ad) return;
    track("Advertised price handed to calculator", { weekly: String(ad.weeklyCost) });
    stashHandoff({
      inputs: {
        ...defaultInputs(config),
        salary: ad.yourSalary ?? ad.footnoteSalary,
        vehiclePrice: result.impliedDriveAway,
        fuelType: ad.fuelType,
        termYears: ad.termYears,
        annualKm: ad.annualKm,
        includeRunningCosts: true,
      },
      label: "From an advertised weekly price",
      impliedRatePct: null,
    });
    router.push("/");
  };

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">What does the ad say?</h2>
        <p className="mt-1 text-sm text-subtle">
          Copy the figures off the advertisement — including the small print, which is where the
          assumptions are.
        </p>

        <div className="mt-4 space-y-3.5">
          <Field
            label="The weekly cost"
            prefix="$"
            suffix="/week"
            value={weeklyCost}
            onChange={setWeeklyCost}
            placeholder="210"
            hint="The big number."
          />
          <Field
            label="Total savings claimed"
            prefix="$"
            value={claimedSaving}
            onChange={setClaimedSaving}
            placeholder="39,297"
            hint="Leave blank if the ad doesn't state one."
          />

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
              The car
            </legend>
            <div className="mt-1 flex gap-2">
              {(
                [
                  ["electric", "Electric"],
                  ["petrol", "Petrol"],
                  ["diesel", "Diesel"],
                  ["hybrid", "Hybrid"],
                ] as [FuelType, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFuelType(v)}
                  aria-pressed={fuelType === v}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                    fuelType === v
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-line bg-panel text-subtle hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-lg border border-line bg-panel-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              From the small print
            </p>
            <div className="mt-2.5 space-y-3">
              <Field label="Salary it assumes" prefix="$" value={footnoteSalary} onChange={setFootnoteSalary} placeholder="85,000" />
              <Field label="Term" suffix="years" value={termYears} onChange={setTermYears} placeholder="5" />
              <Field label="Distance" suffix="km/yr" value={annualKm} onChange={setAnnualKm} placeholder="15,000" />
            </div>
          </div>

          <div className="border-t border-line pt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Optional — about you and the car
            </p>
            <div className="mt-2.5 space-y-3">
              <Field
                label="What you actually earn"
                prefix="$"
                value={yourSalary}
                onChange={setYourSalary}
                placeholder="110,000"
                hint="The ad is priced for somebody else's salary."
              />
              <Field
                label="Drive-away price you found"
                prefix="$"
                value={knownDriveAway}
                onChange={setKnownDriveAway}
                placeholder="66,000"
                hint="If you've looked the car up."
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        {result == null ? (
          <div className="rounded-xl border border-dashed border-line bg-panel-2 p-6 text-sm text-subtle">
            <p className="font-medium text-ink">Enter the weekly figure to start.</p>
            <p className="mt-2 leading-relaxed">
              These advertisements all leave out the same thing: what the car costs. Everything on
              them is derived from that price, so without it the weekly figure can&apos;t be
              compared with another provider&apos;s, or with the car on a dealer&apos;s website. It
              can be worked out from the figures they do print.
            </p>
          </div>
        ) : (
          <>
            {result.impliedDriveAway != null && (
              <div className="rounded-xl border border-accent-border bg-accent-subtle p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  The price the ad doesn&apos;t print
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                  {fmtCurrency(result.impliedDriveAway)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-subtle">
                  drive-away, to cost {fmtCurrency(weeklyCost ?? 0)} a week on the assumptions in the
                  small print. Look the car up: if it sells for about this, the ad is costed
                  honestly and the questions below are about what it leaves out. If it sells for
                  much less, something is being added that hasn&apos;t been named.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toCalculator}
                    className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
                  >
                    Model this properly
                  </button>
                  <Link
                    href="/decode"
                    className="rounded-md border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-ink transition hover:border-accent"
                  >
                    I have a real quote
                  </Link>
                </div>
              </div>
            )}

            <h2 className="mt-6 text-base font-semibold text-ink">What the ad isn&apos;t saying</h2>
            <ul className="mt-3 space-y-3">
              {result.findings.map((f: Finding) => (
                <li key={f.key} className={`rounded-xl border p-4 ${TONE[f.severity].wrap}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE[f.severity].chip}`}
                    >
                      {f.category}
                    </span>
                    <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-subtle">{f.detail}</p>
                  {f.question && (
                    <p className="mt-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
                      <span className="font-semibold">Ask them: </span>
                      {f.question}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
