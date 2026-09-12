"use client";

import { useState } from "react";
import Link from "next/link";
import QuoteField from "./QuoteField";
import VehicleArt from "./VehicleArt";
import {
  consumptionUnit,
  findVehicle,
  vehicleMakes,
  vehiclesForMake,
  type BodyType,
  type Vehicle,
} from "@/lib/au/vehicles";
import { suggestVehicle } from "@/app/actions/vehicles";
import NewVehicleModal from "./NewVehicleModal";
import { AU_STATES, type AuState, type EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import PriceBuilder from "./PriceBuilder";
import {
  carCost,
  financedAfterGstCredit,
  onRoadCosts,
  type PurchaseBreakdown,
} from "@/lib/au/purchase";
import { isFbtExemptVehicle, type FuelType } from "@/lib/au/novated";

/**
 * Everything about the car, in one card at the top of the page.
 *
 * A provider's quote leads with the vehicle, and so does this: the artwork,
 * what it is, and every figure that describes it. Splitting those across a
 * header and a sidebar made people hunt for them.
 *
 * The one thing it will not do is set a price. The same model varies by
 * thousands between dealers, so the price is asked for, not assumed — but
 * choosing the car does set the fuel type (which decides the FBT treatment)
 * and the model's own consumption, which the running-cost benchmark uses.
 *
 * Fields are opt-in: the calculator has no delivery date to ask about, and
 * anything not passed simply isn't rendered.
 *
 * The catalogue is passed in rather than imported, because it comes from the
 * database — an admin can add a car or fix a spec without a release, and this
 * has to show it.
 *
 * `header` is a slot for the lease strip. The lease lives at the top of this
 * card rather than in one of its own: it is context for the car, not a peer
 * of it. Kept as a slot so this component still knows nothing about the store.
 *
 * `readOnlyVehicle` is for the decoder. The car belongs to the lease and was
 * settled in the calculator; on a page for transcribing a provider's document
 * it is something you check against the paperwork, not something you edit.
 * Shown as values rather than disabled controls, because a greyed-out select
 * invites a fight with the page instead of answering the question — so the
 * readout says where to go and change it.
 */

const FUEL_TYPES: { key: FuelType; label: string; hint: string }[] = [
  { key: "electric", label: "Electric", hint: "Battery-electric — FBT exempt under the threshold" },
  { key: "petrol", label: "Petrol", hint: "FBT applies — offset by an employee contribution" },
  { key: "diesel", label: "Diesel", hint: "FBT applies — offset by an employee contribution" },
  { key: "hybrid", label: "Hybrid", hint: "Conventional hybrid — FBT applies" },
  { key: "phev", label: "Plug-in hybrid", hint: "No longer eligible for the FBT exemption" },
];

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-accent bg-accent-subtle text-accent"
          : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export interface VehicleCardProps {
  /** Rendered as a strip across the top, above the artwork. */
  header?: React.ReactNode;
  /** Show the car as settled facts. Delivery stays editable — it belongs to
   *  the quote, not the car, and part-year FBT turns on it. */
  readOnlyVehicle?: boolean;
  /** Where to send someone who wants to change the car. */
  changeHref?: string;
  /** Every vehicle on offer, from the database. */
  catalogue: Vehicle[];
  vehicleId?: string;
  onVehicle: (v: Vehicle | null) => void;

  fuelType: FuelType;
  onFuelType: (f: FuelType) => void;

  price: number | undefined;
  onPrice: (v: number | undefined) => void;
  priceHint?: string;
  /** Stamp duty, rego and CTP, kept apart from the car's price. */
  onRoadCosts?: number;
  /** What was itemised in the price builder, so it reopens with their work. */
  purchase?: PurchaseBreakdown;
  /** Given together, because they are one decision. */
  onPurchase?: (p: { price?: number; onRoadCosts?: number; purchase: PurchaseBreakdown }) => void;
  /** Needed to show what the lease is written over, after the GST credit. */
  config?: EngineConfig;
  /** This price was entered before we asked what was inside it. */
  priceNeedsBreakdown?: boolean;

  annualKm: number | undefined;
  onAnnualKm: (v: number | undefined) => void;

  /** A car the catalogue doesn't have. Only read when no vehicleId is set. */
  customMake?: string;
  customModel?: string;
  customBodyType?: BodyType;
  consumption?: number;
  onCustom?: (patch: {
    make?: string;
    model?: string;
    bodyType?: BodyType;
    consumptionPer100km?: number;
  }) => void;

  /** Registration and CTP vary by state. Omit to skip the control. */
  state?: AuState;
  onState?: (s: AuState | undefined) => void;

  /** Only meaningful where part-year FBT matters — i.e. a real quote. */
  firstHeldDate?: string;
  onFirstHeldDate?: (d: string | undefined) => void;
}

function Readout({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <p className="mt-0.5 text-sm text-subtle">{value}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export default function VehicleCard(p: VehicleCardProps) {
  const selected = findVehicle(p.catalogue, p.vehicleId);
  // The make shown is DERIVED from the selected vehicle whenever there is one.
  // Holding it in state and seeding it from props only worked if the vehicle
  // was known at first render — and the lease loads asynchronously, so on a
  // reload the dropdowns stayed empty while the title showed the right car.
  // Local state only covers the gap between choosing a make and a model.
  const [building, setBuilding] = useState(false);
  const [pendingMake, setPendingMake] = useState("");
  const [adding, setAdding] = useState(false);
  const make = selected?.make ?? pendingMake;

  const models = make ? vehiclesForMake(p.catalogue, make) : [];
  // "Not in the list" is a real answer, not a failure to answer: the
  // catalogue is a few dozen curated models and the market is hundreds.
  const custom = !selected && Boolean(p.customMake || p.customModel);
  const customName = [p.customMake?.trim(), p.customModel?.trim()].filter(Boolean).join(" ");

  // Artwork lives in the database, uploaded per vehicle. Until one exists the
  // request 404s and VehicleArt drops to the covered-car placeholder.
  const art = (
    <VehicleArt
      src={selected ? `/api/vehicle-image/${encodeURIComponent(selected.id)}` : null}
      alt={selected ? `${selected.make} ${selected.model}` : customName || "Your car"}
      bodyType={selected?.bodyType ?? p.customBodyType}
    />
  );

  // The exemption is the single biggest thing about a car on this page — it is
  // the difference between packaging the whole lease pre-tax and handing back
  // a fifth of the car's value as taxable benefit every year. It goes above
  // the picture because that is where the eye lands first, and because it is a
  // fact about the car rather than about any of the figures below it.
  //
  // Only once there is a price: the threshold is a price test, so with nothing
  // entered we would be claiming an exemption we haven't checked.
  const fbtExempt =
    p.config != null && p.price != null && isFbtExemptVehicle(p.fuelType, p.price, p.config);

  return (
    <section className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      {p.header && (
        <div className="border-b border-line px-4 py-3 sm:px-5">{p.header}</div>
      )}
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          {fbtExempt && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-success/40 bg-success-subtle px-3 py-2">
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 fill-success"
              >
                <path d="M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm4.03 6.2-4.9 5.2a.95.95 0 0 1-1.38 0L5.97 10.8a.95.95 0 0 1 1.38-1.3l1.09 1.16 4.21-4.47a.95.95 0 1 1 1.38 1.3Z" />
              </svg>
              <p className="text-[12px] leading-snug text-success-text">
                <strong className="font-semibold">No FBT on this car.</strong> Battery-electric
                and under the {fmtCurrency(p.config!.lct.thresholdFuelEfficient)} threshold, so
                the whole package comes out of pre-tax pay with nothing to contribute back.
              </p>
            </div>
          )}
          <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2 sm:h-44">
            {art}
          </div>
          {selected ? (
            <>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">
                {selected.make} {selected.model}
              </h2>
              <p className="text-sm text-muted">
                {selected.bodyType} ·{" "}
                {selected.fuelType === "electric"
                  ? `${selected.consumption} kWh/100km`
                  : `${selected.consumption} L/100km`}
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">
                {customName || "Your car"}
              </h2>
              {customName && (
                <p className="text-sm text-muted">
                  {p.customBodyType ?? "SUV"}
                  {p.consumption != null && ` · ${p.consumption} ${consumptionUnit(p.fuelType)}`}
                </p>
              )}
            </>
          )}
        </div>

        {p.readOnlyVehicle ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Readout label="Make" value={selected?.make ?? "Not set"} />
              <Readout label="Model" value={selected?.model ?? "Not set"} />
              <Readout
                label="Price of the car"
                value={p.price != null ? fmtCurrency(p.price) : "Not set"}
                note={
                  (p.onRoadCosts ?? 0) > 0
                    ? `+ ${fmtCurrency(p.onRoadCosts!)} on-roads`
                    : undefined
                }
              />
              <Readout
                label="Kilometres a year"
                value={p.annualKm != null ? `${p.annualKm.toLocaleString("en-AU")} km` : "Not set"}
              />
              <Readout
                label="Fuel type"
                value={FUEL_TYPES.find((f) => f.key === p.fuelType)?.label ?? p.fuelType}
              />
              {p.onState && (
                <Readout label="Registered in" value={p.state ?? "National average"} />
              )}
            </div>

            <p className="text-[11px] text-muted">
              The car comes from your lease.{" "}
              {p.changeHref && (
                <>
                  <Link href={p.changeHref} className="font-medium text-accent hover:underline">
                    Change it there
                  </Link>{" "}
                  and every quote on this lease follows.
                </>
              )}
            </p>

            {p.onFirstHeldDate && (
              <label className="block max-w-xs">
                <span className="text-sm font-medium text-ink">Expected delivery</span>
                <input
                  type="date"
                  value={p.firstHeldDate ?? ""}
                  onChange={(e) => p.onFirstHeldDate?.(e.target.value || undefined)}
                  className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                />
                <span className="mt-1 block text-[11px] leading-snug text-muted">
                  Optional, and specific to this quote. The FBT year ends 31 March, so a car
                  delivered late in it is a fringe benefit for only part of the year — and your
                  first-year deductions differ from the quote.
                </span>
              </label>
            )}
          </div>
        ) : (
        <div className="space-y-4">
          {custom ? (
            /* A car we don't stock is shown as what it is rather than as two
               dropdowns that cannot represent it. */
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel-2 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink">{customName}</p>
                <p className="text-[11px] text-muted">
                  {p.customBodyType ?? "SUV"}
                  {p.consumption != null && ` · ${p.consumption} ${consumptionUnit(p.fuelType)}`}
                  {" · not in our list yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() =>
                    p.onCustom?.({
                      make: undefined,
                      model: undefined,
                      bodyType: undefined,
                      consumptionPer100km: undefined,
                    })
                  }
                  className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:text-ink"
                >
                  Pick from the list
                </button>
              </div>
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">Make</span>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Can&apos;t find your car?
                </button>
              </span>
              <select
                value={make}
                onChange={(e) => {
                  setPendingMake(e.target.value);
                  p.onVehicle(null); // a new make invalidates the model
                }}
                className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Choose…</option>
                {vehicleMakes(p.catalogue).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            {custom ? (
              <label className="block">
                <span className="text-sm font-medium text-ink">Make</span>
                <input
                  value={p.customMake ?? ""}
                  onChange={(e) => p.onCustom?.({ make: e.target.value })}
                  placeholder="e.g. Skoda"
                  className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
            ) : (
              <label className="block">
                {/* The same flex header as Make, which carries a link beside
                    its label. A plain inline span here measured a pixel
                    shorter and put the two selects 4px out of line. */}
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">Model</span>
                </span>
                <select
                  value={selected?.id ?? ""}
                  disabled={!make}
                  onChange={(e) => p.onVehicle(findVehicle(p.catalogue, e.target.value))}
                  className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
                >
                  <option value="">{make ? "Choose…" : "Pick a make first"}</option>
                  {models.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.model}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {p.onPurchase ? (
              <div>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">Price of the car</span>
                  <button
                    type="button"
                    onClick={() => setBuilding(true)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {p.price != null ? "Break it down" : "Work it out"}
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setBuilding(true)}
                  className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-left transition hover:border-accent"
                >
                  <span className="text-xs text-muted">$</span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      p.price != null ? "text-ink" : "text-muted/70"
                    }`}
                  >
                    {p.price != null
                      ? p.price.toLocaleString("en-AU", { maximumFractionDigits: 0 })
                      : "85,000"}
                  </span>
                </button>
                {/* Asked once, and only of a price nobody was ever asked
                    about. Registration and stamp duty inside this figure are
                    taxed as though they were part of the car — so the cheap
                    fix is to find out, not to assume either way. */}
                {p.priceNeedsBreakdown && (
                  <div className="mt-2 rounded-md border border-warning/40 bg-warning-subtle px-2.5 py-2">
                    <p className="text-[11px] leading-snug text-warning-text">
                      <strong>Does this include stamp duty and rego?</strong> If it&apos;s a
                      drive-away figure they shouldn&apos;t be in here — the FBT is worked out on
                      the car alone, so you&apos;d be taxed on 20% of them every year.
                      {p.fuelType === "electric" &&
                        " On an electric car it also decides whether you stay under the exemption threshold."}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBuilding(true)}
                        className="rounded border border-warning/50 bg-panel px-2 py-0.5 text-[11px] font-medium text-warning-text transition hover:border-warning"
                      >
                        Split it out
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          p.onPurchase?.({
                            price: p.price,
                            onRoadCosts: undefined,
                            purchase: { vehicle: p.price },
                          })
                        }
                        className="rounded px-2 py-0.5 text-[11px] font-medium text-warning-text/80 transition hover:text-warning-text"
                      >
                        It&apos;s just the car
                      </button>
                    </div>
                  </div>
                )}

                <span className="mt-1 block text-[11px] leading-snug text-muted">
                  {p.price != null && p.config ? (
                    <>
                      {(p.onRoadCosts ?? 0) > 0 && (
                        <>
                          Plus {fmtCurrency(p.onRoadCosts!)} of on-road costs —{" "}
                          {fmtCurrency(p.price + p.onRoadCosts!)} drive-away, and only the car is
                          taxed.{" "}
                        </>
                      )}
                      The lease is written over{" "}
                      <strong className="text-subtle">
                        {fmtCurrency(
                          financedAfterGstCredit(
                            {
                              vehicle: p.price,
                              stampDuty: p.onRoadCosts,
                            },
                            p.config,
                          ),
                        )}
                      </strong>{" "}
                      once the financier claims the GST back.
                    </>
                  ) : (
                    (p.priceHint ??
                      "The car itself, GST included. A drive-away figure includes stamp duty and rego, which aren't taxed — work it out to keep them apart.")
                  )}
                </span>
              </div>
            ) : (
              <QuoteField
                label="Price of the car"
                value={p.price}
                onChange={p.onPrice}
                placeholder="85,000"
                hint={p.priceHint ?? "The car itself, GST included — not the drive-away total."}
              />
            )}
            <QuoteField
              label="Kilometres a year"
              prefix={null}
              suffix="km"
              value={p.annualKm}
              onChange={p.onAnnualKm}
              placeholder="15,000"
              hint="Drives the fuel, servicing and tyre budgets."
            />
          </div>

          <div>
            <span className="text-sm font-medium text-ink">
              Fuel type
              {selected && <span className="ml-2 text-[11px] font-normal text-muted">set by the model</span>}
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FUEL_TYPES.map((f) => (
                <Chip
                  key={f.key}
                  active={p.fuelType === f.key}
                  title={f.hint}
                  onClick={() => p.onFuelType(f.key)}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          {p.onState && (
            <div>
              <span className="text-sm font-medium text-ink">Registered in</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AU_STATES.map((st) => (
                  <Chip
                    key={st}
                    active={p.state === st}
                    onClick={() => p.onState?.(p.state === st ? undefined : st)}
                  >
                    {st}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Registration and CTP vary a lot between states. Leave blank for a national average.
              </p>
            </div>
          )}

          {p.onFirstHeldDate && (
            <label className="block max-w-xs">
              <span className="text-sm font-medium text-ink">Expected delivery</span>
              <input
                type="date"
                value={p.firstHeldDate ?? ""}
                onChange={(e) => p.onFirstHeldDate?.(e.target.value || undefined)}
                className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] leading-snug text-muted">
                Optional. The FBT year ends 31 March, so a car delivered late in it is a fringe
                benefit for only part of the year — and your first-year deductions differ from the
                quote.
              </span>
            </label>
          )}
        </div>
        )}
      </div>

      {adding && (
        <NewVehicleModal
          initial={{
            make: p.customMake,
            model: p.customModel,
            bodyType: p.customBodyType,
            fuelType: p.fuelType,
            consumption: p.consumption,
          }}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            // The lease gets the car immediately. Offering it to the
            // catalogue is a separate, best-effort thing: it needs an admin
            // before it helps anyone else, and it must never be the reason
            // this person's own page stays empty.
            p.onVehicle(null);
            p.onCustom?.({
              make: v.make,
              model: v.model,
              bodyType: v.bodyType,
              consumptionPer100km: v.consumption,
            });
            p.onFuelType(v.fuelType);
            setAdding(false);
            void suggestVehicle({
              make: v.make,
              model: v.model,
              fuelType: v.fuelType,
              consumption: v.consumption,
              bodyType: v.bodyType,
            });
          }}
        />
      )}

      {building && p.onPurchase && p.config && (
        <PriceBuilder
          config={p.config!}
          initial={p.purchase ?? (p.price != null ? { vehicle: p.price } : {})}
          onCancel={() => setBuilding(false)}
          onApply={(b) => {
            p.onPurchase!({
              price: carCost(b) || undefined,
              onRoadCosts: b.financeOnRoads === false ? undefined : onRoadCosts(b) || undefined,
              purchase: b,
            });
            setBuilding(false);
          }}
        />
      )}
    </section>
  );
}
