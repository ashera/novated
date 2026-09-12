"use client";

import { useEffect, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import {
  amountToFinance,
  carCost,
  financedAfterGstCredit,
  hasCarCost,
  onRoadCosts,
  type PurchaseBreakdown,
} from "@/lib/au/purchase";
import { carGstCredit } from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * Working out what the car actually costs, item by item.
 *
 * A single "price" box gets this wrong more often than not, because a dealer's
 * drive-away figure bundles things the tax rules treat completely differently
 * — and the person typing it has no way to know that. The split is not a
 * detail: registration, stamp duty and CTP are excluded from the FBT base
 * value, so rolling them into the price charges the user 20% of their own
 * registration as taxable value, every year of the lease.
 *
 * So the modal is organised around the split rather than around the invoice:
 * what counts as the car, then what doesn't, with the consequence of each
 * stated where it is entered. The running totals are the teaching — you can
 * watch the base value stay put while the amount financed climbs.
 *
 * It asks rather than estimates. Stamp duty alone varies by state, by price
 * and by fuel type, and a number we invented would be worse than the one
 * already printed on the quote in front of them.
 */

interface FieldDef {
  key: keyof PurchaseBreakdown;
  label: string;
  hint: string;
  placeholder: string;
}

const CAR_FIELDS: FieldDef[] = [
  {
    key: "vehicle",
    label: "The car itself",
    hint: "What you negotiated, GST included — before any on-road costs are added.",
    placeholder: "55,000",
  },
  {
    key: "delivery",
    label: "Dealer delivery",
    hint: "The dealer's delivery or handling charge. Part of the car's cost for tax.",
    placeholder: "1,800",
  },
  {
    key: "accessories",
    label: "Accessories fitted",
    hint: "Tow bar, tint, roof racks, mats — anything fitted before you take delivery.",
    placeholder: "1,200",
  },
];

const ON_ROAD_FIELDS: FieldDef[] = [
  {
    key: "stampDuty",
    label: "Stamp duty",
    hint: "Set by your state on the purchase price. It's itemised on the dealer's quote.",
    placeholder: "2,100",
  },
  {
    key: "registration",
    label: "Registration",
    hint: "The first registration period.",
    placeholder: "900",
  },
  {
    key: "ctp",
    label: "CTP insurance",
    hint: "Compulsory third party. Bundled into registration in some states.",
    placeholder: "600",
  },
  { key: "plates", label: "Plates", hint: "Including a personalised set.", placeholder: "70" },
  {
    key: "other",
    label: "Anything else",
    hint: "Other on-road charges on the invoice.",
    placeholder: "0",
  },
];

function Money({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{def.label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-1.5 focus-within:border-accent">
        <span className="text-xs text-muted">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value ?? ""}
          placeholder={def.placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = parseFloat(raw);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
          className="w-full bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-muted">{def.hint}</span>
    </label>
  );
}

function Total({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: number;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-ink" : ""}`}>
      <span className={strong ? "text-sm font-semibold" : "text-sm text-subtle"}>
        {label}
        {note && <span className="block text-[11px] font-normal text-muted">{note}</span>}
      </span>
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm font-medium text-subtle"}`}>
        {value < 0 ? `− ${fmtCurrency(Math.abs(value))}` : fmtCurrency(value)}
      </span>
    </div>
  );
}

export default function PriceBuilder({
  initial,
  config,
  onCancel,
  onApply,
}: {
  initial: PurchaseBreakdown;
  config: EngineConfig;
  onCancel: () => void;
  onApply: (b: PurchaseBreakdown) => void;
}) {
  const [b, setB] = useState<PurchaseBreakdown>(initial);
  const set = (k: keyof PurchaseBreakdown, v: number | undefined) =>
    setB((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  const car = carCost(b);
  const onRoads = onRoadCosts(b);
  const financeOnRoads = b.financeOnRoads !== false;
  const ready = hasCarCost(b);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Work out the price of the car"
        className="relative z-10 my-8 w-full max-w-2xl rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">What does the car actually cost?</h2>
          <p className="mt-1 text-sm text-muted">
            A drive-away price bundles together things the tax rules keep apart. Split it out
            once here and every figure after it is right.
          </p>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-sm font-semibold text-ink">The car</h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              These make up its cost price — what the FBT is worked out on, what the GST credit
              is claimed against, and what the luxury car thresholds are measured against.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {CAR_FIELDS.map((f) => (
                <Money key={f.key} def={f} value={b[f.key] as number | undefined} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">On-road costs</h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              The ATO excludes all of these from the base value. Financing them means repaying
              them — it doesn&apos;t mean being taxed on them.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {ON_ROAD_FIELDS.map((f) => (
                <Money key={f.key} def={f} value={b[f.key] as number | undefined} onChange={(v) => set(f.key, v)} />
              ))}
            </div>

            {onRoads > 0 && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={financeOnRoads}
                  onChange={(e) => setB((prev) => ({ ...prev, financeOnRoads: e.target.checked }))}
                  className="mt-0.5 accent-[var(--color-accent)]"
                />
                <span className="text-sm text-ink">
                  Finance these with the car
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    Usually yes — the provider pays the dealer the whole invoice. Untick if
                    you&apos;re paying the on-roads yourself.
                  </span>
                </span>
              </label>
            )}
          </section>
        </div>

        {/* The chain in full, because "financed" is not the invoice total and
            this is the one place a user would reasonably assume it is. */}
        <div className="space-y-1.5 border-t border-line bg-panel-2 px-5 py-3.5">
          <Total label="Cost of the car" note="Taxed on this" value={car} />
          <Total label="On-road costs" note="Not taxed on these" value={onRoads} />
          <Total
            label={
              financeOnRoads || onRoads === 0 ? "Drive-away price" : "Drive-away price (car only)"
            }
            note={
              financeOnRoads || onRoads === 0
                ? "What the dealer invoices"
                : "You're paying the on-roads yourself"
            }
            value={amountToFinance(b)}
          />
          <Total
            label="Less the GST the financier claims back"
            note={
              car > config.gst.carLimit
                ? `Capped at one eleventh of the ${fmtCurrency(config.gst.carLimit)} car limit`
                : undefined
            }
            value={-carGstCredit(car, config)}
          />
          <div className="border-t border-line pt-1.5">
            <Total
              label="Financed"
              note="What the lease is written over, and what the repayments are calculated on"
              value={financedAfterGstCredit(b, config)}
              strong
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => onApply(b)}
            disabled={!ready}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
          >
            Use these figures
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          {!ready && (
            <span className="text-[11px] text-muted">Put in the car&apos;s price to continue.</span>
          )}
        </div>
      </div>
    </div>
  );
}
