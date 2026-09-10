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
 * The image is a nicety, but the right kind: a quote from a provider shows the
 * car, and a page of figures about a car you can see is a different experience
 * from a page of figures about an abstraction.
 */

export default function VehiclePicker({
  vehicleId,
  onChange,
  compact = false,
}: {
  vehicleId?: string;
  onChange: (v: Vehicle | null) => void;
  /** Smaller frame, for a sidebar rather than a page header. */
  compact?: boolean;
}) {
  const selected = findVehicle(vehicleId);
  const [make, setMake] = useState<string>(selected?.make ?? "");
  const [imageFailed, setImageFailed] = useState(false);

  const makes = vehicleMakes();
  const models = make ? vehiclesForMake(make) : [];

  const pickMake = (m: string) => {
    setMake(m);
    onChange(null); // a new make invalidates the model
    setImageFailed(false);
  };
  const pickModel = (id: string) => {
    setImageFailed(false);
    onChange(findVehicle(id));
  };

  return (
    <div>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2 ${
          compact ? "h-28" : "h-44"
        }`}
      >
        {selected && !imageFailed ? (
          // Artwork lives in the database and is uploaded per vehicle; until
          // one exists this 404s and we fall back to the drawing below.
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
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-medium text-muted">Make</span>
          <select
            value={make}
            onChange={(e) => pickMake(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
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

      {selected ? (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Sets the fuel type and this model&apos;s own consumption (
          {selected.fuelType === "electric"
            ? `${selected.consumption} kWh`
            : `${selected.consumption} L`}
          /100km) instead of a class average. It does <strong>not</strong> set the price —
          that varies by dealer, so take it from your own quote.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Optional. Picking your car sharpens the running-cost estimate and shows you what
          you&apos;re buying. Not in the list? Just set the fuel type below.
        </p>
      )}
    </div>
  );
}
