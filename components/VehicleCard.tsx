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
import {
  checkFbtExemption,
  isPreOwned,
  type CarCondition,
  type FuelType,
  type PurchaseChannel,
} from "@/lib/au/novated";

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

const CONDITIONS: { key: CarCondition; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "First registered to you" },
  { key: "demo", label: "Ex-demo", hint: "Registered to the dealer first — the date still matters" },
  { key: "used", label: "Used", hint: "Somebody has owned it before" },
];

const CHANNELS: { key: PurchaseChannel; label: string }[] = [
  { key: "dealer", label: "A dealer" },
  { key: "private", label: "A private seller" },
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

  /** New, ex-demo or second-hand. Omit `onCarHistory` to skip the control —
   *  the decoder shows it as a readout instead. */
  condition?: CarCondition;
  firstRegisteredDate?: string;
  firstRetailPrice?: number;
  purchasedFrom?: PurchaseChannel;
  /** One callback, because these are one decision: saying "used" is what
   *  makes the rest of them mean anything. */
  onCarHistory?: (patch: {
    condition?: CarCondition;
    firstRegisteredDate?: string;
    firstRetailPrice?: number;
    purchasedFrom?: PurchaseChannel;
  }) => void;

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
  const exemption =
    p.config != null && p.price != null
      ? checkFbtExemption(
          {
            fuelType: p.fuelType,
            vehiclePrice: p.price,
            condition: p.condition,
            firstRegisteredDate: p.firstRegisteredDate,
            firstRetailPrice: p.firstRetailPrice,
          },
          p.config,
        )
      : null;
  const preOwned = isPreOwned(p.condition);
  // A private seller isn't registered for GST, so there is no credit anywhere
  // on this card — not in the hint under the price, and not in the builder.
  const claimsGstCredit = p.purchasedFrom !== "private";

  /**
   * The exemption badge, defined once and placed twice.
   *
   * Editing the car it belongs above the picture, where the eye lands and
   * where changing the fuel type or the price will move it. Read-only there
   * is nothing to change and the left column is only a thumbnail and a name,
   * so it goes across the top instead — in a 13rem column it wrapped to five
   * lines and set the height of the whole card.
   */
  const fbtBadge = exemption?.exempt ? (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                exemption.unverified
                  ? "border-warning/40 bg-warning-subtle"
                  : "border-success/40 bg-success-subtle"
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  exemption.unverified ? "fill-warning" : "fill-success"
                }`}
              >
                <path d="M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm4.03 6.2-4.9 5.2a.95.95 0 0 1-1.38 0L5.97 10.8a.95.95 0 0 1 1.38-1.3l1.09 1.16 4.21-4.47a.95.95 0 1 1 1.38 1.3Z" />
              </svg>
              {/* A qualified yes is still a yes, but it can't wear the same
                  colour as a settled one — the whole point of the badge is
                  that it is trusted at a glance. */}
              <p
                className={`text-[12px] leading-snug ${
                  exemption.unverified ? "text-warning-text" : "text-success-text"
                }`}
              >
                {exemption.unverified ? (
                  <>
                    <strong className="font-semibold">Probably no FBT on this car.</strong>{" "}
                    {exemption.unverified}
                  </>
                ) : (
                  <>
                    <strong className="font-semibold">No FBT on this car.</strong>{" "}
                    {preOwned
                      ? "Battery-electric, first registered after the exemption started, and under the threshold it was measured against — so"
                      : `Battery-electric and under the ${fmtCurrency(p.config!.lct.thresholdFuelEfficient)} threshold, so`}{" "}
                    the whole package comes out of pre-tax pay with nothing to contribute back.
                  </>
                )}
              </p>
            </div>
  ) : null;

  // Name and spec, shared: the tall editing layout stacks them under the
  // artwork, the settled one sets them beside a thumbnail.
  const carName = selected ? `${selected.make} ${selected.model}` : customName || "Your car";
  const carSpec = selected
    ? `${selected.bodyType} · ${selected.consumption} ${consumptionUnit(selected.fuelType)}`
    : customName
      ? `${p.customBodyType ?? "SUV"}${p.consumption != null ? ` · ${p.consumption} ${consumptionUnit(p.fuelType)}` : ""}`
      : null;

  return (
    <section className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      {p.header && (
        <div className="border-b border-line px-4 py-3 sm:px-5">{p.header}</div>
      )}
      <div className="p-4 sm:p-5">
        {/*
          Two shapes, because the card is doing two different jobs.
          Editing, the artwork is the subject and the controls run beside it,
          so a tall left column is right. Settled, it is a receipt: six short
          readouts and a thumbnail, and a column layout leaves two thirds of
          the card empty whichever side the taller content happens to land on.
          So it becomes a band — a strip naming the car, then the facts across
          the full width.
        */}
        {p.readOnlyVehicle ? (
          <>
            {/* One row, not two. The strip is a thumbnail and a name and the
                badge is a single sentence — each was taking a full row of the
                card to say very little. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex shrink-0 items-center gap-3">
                {/* Wide rather than tall: the artwork is a car in profile, and
                    object-contain letterboxes it in anything squarer. Big
                    enough to recognise the car at a glance, which is the only
                    job it has here. */}
                <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-panel-2 sm:h-24 sm:w-44">
                  {art}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold tracking-tight text-ink">
                    {carName}
                  </h2>
                  {carSpec && <p className="truncate text-xs text-muted">{carSpec}</p>}
                </div>
              </div>
              {fbtBadge && <div className="min-w-0 flex-1">{fbtBadge}</div>}
            </div>

            <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
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
              {preOwned && (
                <>
                  <Readout
                    label="Condition"
                    value={CONDITIONS.find((c) => c.key === p.condition)?.label ?? "Used"}
                    note={
                      p.firstRegisteredDate
                        ? `First registered ${p.firstRegisteredDate}`
                        : "First registered: not set"
                    }
                  />
                  <Readout
                    label="Bought from"
                    value={p.purchasedFrom === "private" ? "A private seller" : "A dealer"}
                    note={
                      p.purchasedFrom === "private" ? "No GST credit to claim" : undefined
                    }
                  />
                </>
              )}
              {/* A cell of its own in the same grid. It is the one editable
                  thing on a settled card, and it belongs with the facts it
                  qualifies rather than in a row by itself. */}
              {p.onFirstHeldDate && (
                <label className="block">
                  <span className="text-sm font-medium text-ink">Expected delivery</span>
                  <input
                    type="date"
                    value={p.firstHeldDate ?? ""}
                    onChange={(e) => p.onFirstHeldDate?.(e.target.value || undefined)}
                    className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                  />
                  <span className="mt-1 block text-[11px] leading-snug text-muted">
                    Optional. Late in the FBT year means a part-year benefit.
                  </span>
                </label>
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
            </div>
          </>
        ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          {fbtBadge && <div className="mb-2">{fbtBadge}</div>}
          <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2 sm:h-44">
            {art}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">{carName}</h2>
          {carSpec && <p className="text-sm text-muted">{carSpec}</p>}
        </div>

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
                            claimsGstCredit,
                          ),
                        )}
                      </strong>{" "}
                      {claimsGstCredit
                        ? "once the financier claims the GST back."
                        : "— a private seller charges no GST, so there's none to claim back."}
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

          {/* The four blocks below are chip rows and a date — none of them
              fills a column on a wide screen, so stacked they left half the
              card empty and pushed everything after it down. Paired up they
              read as what they are: two facts about the car, then two about
              the arrangement. Still one per row on a phone. */}
          <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-2">

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

          {/* Asked here and not buried in an "advanced" drawer, because the
              answer changes whether the biggest number on the page exists.
              New is the default and needs nothing else; the follow-ups only
              appear once someone says otherwise. */}
          {p.onCarHistory && (
            /* Once it expands it is no longer a chip row, and holding it in
               half the width both squeezes its three fields into a stack and
               stretches the cell beside it to match. Full width, laid across,
               and the gap it leaves next to Fuel type is one row rather than
               the height of the whole panel. */
            <div className={preOwned ? "lg:col-span-2" : undefined}>
              <span className="text-sm font-medium text-ink">Condition</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c.key}
                    active={(p.condition ?? "new") === c.key}
                    title={c.hint}
                    onClick={() => p.onCarHistory?.({ condition: c.key })}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
              {!preOwned && (
                <p className="mt-1.5 text-[11px] text-muted">
                  A second-hand electric car has to clear one more test before it&apos;s FBT
                  exempt, so it&apos;s worth saying if yours isn&apos;t new.
                </p>
              )}

              {preOwned && (
                <div className="mt-3 grid items-start gap-x-5 gap-y-3 rounded-lg border border-line bg-panel-2 p-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-medium text-ink">First registered</span>
                    <input
                      type="date"
                      value={p.firstRegisteredDate ?? ""}
                      onChange={(e) =>
                        p.onCarHistory?.({ firstRegisteredDate: e.target.value || undefined })
                      }
                      className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                    />
                    <span className="mt-1 block text-[11px] leading-snug text-muted">
                      When the car first went on the road — not when you take delivery. The FBT
                      exemption only reaches cars first held and used from{" "}
                      {p.config?.fbt.evExemption.firstHeldFrom ?? "1 July 2022"}, and that&apos;s
                      fixed to the car, so no later owner can claim it.
                    </span>
                  </label>

                  {p.fuelType === "electric" && (
                    <QuoteField
                      label="Price when new"
                      value={p.firstRetailPrice}
                      onChange={(v) => p.onCarHistory?.({ firstRetailPrice: v })}
                      placeholder="72,000"
                      hint="Optional, but it's the number the exemption's price cap is measured on — what it sold for new, against that year's threshold, not what you're paying now."
                    />
                  )}

                  <div>
                    <span className="text-sm font-medium text-ink">Bought from</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CHANNELS.map((c) => (
                        <Chip
                          key={c.key}
                          active={(p.purchasedFrom ?? "dealer") === c.key}
                          onClick={() => p.onCarHistory?.({ purchasedFrom: c.key })}
                        >
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted">
                      A private seller charges no GST, so there&apos;s no credit for the financier
                      to claim and the lease is written over the whole price.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

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


          </div>
        </div>
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
          claimsGstCredit={claimsGstCredit}
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
