"use client";

import { useState } from "react";
import QuoteField from "./QuoteField";
import VehicleArt from "./VehicleArt";
import { findVehicle, vehicleMakes, vehiclesForMake, type Vehicle } from "@/lib/au/vehicles";
import { AU_STATES, type AuState } from "@/lib/au/config";
import type { FuelType } from "@/lib/au/novated";

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
  /** Every vehicle on offer, from the database. */
  catalogue: Vehicle[];
  vehicleId?: string;
  onVehicle: (v: Vehicle | null) => void;

  fuelType: FuelType;
  onFuelType: (f: FuelType) => void;

  price: number | undefined;
  onPrice: (v: number | undefined) => void;
  priceHint?: string;

  annualKm: number | undefined;
  onAnnualKm: (v: number | undefined) => void;

  /** Registration and CTP vary by state. Omit to skip the control. */
  state?: AuState;
  onState?: (s: AuState | undefined) => void;

  /** Only meaningful where part-year FBT matters — i.e. a real quote. */
  firstHeldDate?: string;
  onFirstHeldDate?: (d: string | undefined) => void;
}

export default function VehicleCard(p: VehicleCardProps) {
  const selected = findVehicle(p.catalogue, p.vehicleId);
  // The make shown is DERIVED from the selected vehicle whenever there is one.
  // Holding it in state and seeding it from props only worked if the vehicle
  // was known at first render — and the lease loads asynchronously, so on a
  // reload the dropdowns stayed empty while the title showed the right car.
  // Local state only covers the gap between choosing a make and a model.
  const [pendingMake, setPendingMake] = useState("");
  const make = selected?.make ?? pendingMake;

  const models = make ? vehiclesForMake(p.catalogue, make) : [];

  // Artwork lives in the database, uploaded per vehicle. Until one exists the
  // request 404s and VehicleArt drops to the covered-car placeholder.
  const art = (
    <VehicleArt
      src={selected ? `/api/vehicle-image/${encodeURIComponent(selected.id)}` : null}
      alt={selected ? `${selected.make} ${selected.model}` : "Your car"}
      bodyType={selected?.bodyType}
    />
  );

  return (
    <section className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      {p.header && (
        <div className="border-b border-line px-4 py-3 sm:px-5">{p.header}</div>
      )}
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
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
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">Your car</h2>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Make</span>
              <select
                value={make}
                onChange={(e) => {
                  setPendingMake(e.target.value);
                  p.onVehicle(null); // a new make invalidates the model
                }}
                className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Not listed / skip</option>
                {vehicleMakes(p.catalogue).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Model</span>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <QuoteField
              label="Price of the car"
              alsoCalled={["Vehicle Price", "Drive Away Price"]}
              value={p.price}
              onChange={p.onPrice}
              placeholder="85,000"
              hint={p.priceHint ?? "GST included, as advertised. Take it from your own quote."}
            />
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
      </div>
    </section>
  );
}
