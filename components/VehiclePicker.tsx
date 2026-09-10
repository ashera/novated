"use client";

import { useState } from "react";
import { findVehicle, vehicleMakes, vehiclesForMake, type Vehicle } from "@/lib/au/vehicles";
import CarProfile, { BODY_SHAPES } from "./CarProfile";

/**
 * Choose the car, see the car.
 *
 * The picker deliberately does NOT set a price: the same model varies by
 * thousands between dealers, and inventing one would be worse than leaving it
 * blank. What it does set is fuel type — which decides the FBT treatment — and
 * the vehicle's own energy consumption, which the running-cost benchmark uses.
 *
 * Two layouts. "hero" is a band across the top of the page, the way a provider
 * quote leads with the car; "compact" is a sidebar-sized version for anywhere
 * the car is a detail rather than the headline.
 */

const FRAME =
  "flex items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2";

export default function VehiclePicker({
  vehicleId,
  onChange,
  layout = "compact",
}: {
  vehicleId?: string;
  onChange: (v: Vehicle | null) => void;
  layout?: "hero" | "compact";
}) {
  const selected = findVehicle(vehicleId);
  const [make, setMake] = useState<string>(selected?.make ?? "");
  const [imageFailed, setImageFailed] = useState(false);

  const makes = vehicleMakes();
  const models = make ? vehiclesForMake(make) : [];
  const hero = layout === "hero";

  const pickMake = (m: string) => {
    setMake(m);
    onChange(null); // a new make invalidates the model
    setImageFailed(false);
  };
  const pickModel = (id: string) => {
    setImageFailed(false);
    onChange(findVehicle(id));
  };

  const art =
    selected && !imageFailed ? (
      // Artwork lives in the database and is uploaded per vehicle; until one
      // exists this 404s and we fall back to the drawing.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/vehicle-image/${encodeURIComponent(selected.id)}`}
        alt={`${selected.make} ${selected.model}`}
        className="h-full w-full object-contain"
        onError={() => setImageFailed(true)}
      />
    ) : (
      <CarProfile
        shape={BODY_SHAPES[selected?.bodyType ?? "SUV"]}
        colour={selected ? "#5b6b7f" : "#b3b9c4"}
        title={selected ? `${selected.make} ${selected.model}` : undefined}
        className="h-full w-full text-ink"
      />
    );

  const selects = (
    <div className={`grid gap-2 ${hero ? "grid-cols-2 max-w-md" : "grid-cols-2"}`}>
      <label className="block">
        <span className="text-xs font-medium text-muted">Make</span>
        <select
          value={make}
          onChange={(e) => pickMake(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">Choose…</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Model</span>
        <select
          value={selected?.id ?? ""}
          disabled={!make}
          onChange={(e) => pickModel(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
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
  );

  const note = selected ? (
    <>
      Using this model&apos;s own consumption (
      {selected.fuelType === "electric"
        ? `${selected.consumption} kWh`
        : `${selected.consumption} L`}
      /100km) rather than a class average. It doesn&apos;t set the price — that varies by
      dealer, so take it from your quote.
    </>
  ) : (
    <>
      Optional. Picking your car sharpens the running-cost estimate and shows you what
      you&apos;re buying. Not listed? Just set the fuel type.
    </>
  );

  if (!hero) {
    return (
      <div>
        <div className={`${FRAME} h-28`}>{art}</div>
        <div className="mt-3">{selects}</div>
        <p className="mt-2 text-[11px] leading-snug text-muted">{note}</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className={`${FRAME} h-36 sm:h-44`}>{art}</div>

        <div>
          {selected ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {selected.make} {selected.model}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {selected.bodyType} ·{" "}
                {selected.fuelType === "electric"
                  ? "Battery electric"
                  : selected.fuelType === "phev"
                    ? "Plug-in hybrid"
                    : selected.fuelType.charAt(0).toUpperCase() + selected.fuelType.slice(1)}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Which car are you looking at?
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Pick it and we&apos;ll use its real running costs.
              </p>
            </>
          )}

          <div className="mt-4">{selects}</div>
          <p className="mt-2 max-w-xl text-[11px] leading-snug text-muted">{note}</p>
        </div>
      </div>
    </section>
  );
}
