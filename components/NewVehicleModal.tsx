"use client";

import { useEffect, useState } from "react";
import {
  BODY_TYPES,
  CONSUMPTION_RANGE,
  FUEL_TYPES,
  consumptionUnit,
  validateVehicle,
  type BodyType,
} from "@/lib/au/vehicles";
import type { FuelType } from "@/lib/au/novated";

/**
 * Describing a car the catalogue doesn't have.
 *
 * A modal rather than fields that unfold inside the card, because this is a
 * short, self-contained task with its own validation — and because the card
 * is already the busiest thing on the page. Adding a car should feel like a
 * detour and a return, not like the page growing under you.
 *
 * Everything here is about getting one figure right. Make and model are so
 * the page can name the car; body type picks a drawing. Consumption is the
 * only one that changes a number: without it the engine uses a class average,
 * which at 15,000km a year is hundreds of dollars out on the running-cost
 * budget that every padding finding is measured against.
 */

const FUEL_LABEL: Record<FuelType, string> = {
  electric: "Electric",
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  phev: "Plug-in hybrid",
};

export interface NewVehicle {
  make: string;
  model: string;
  bodyType: BodyType;
  fuelType: FuelType;
  consumption: number;
}

export default function NewVehicleModal({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Partial<NewVehicle>;
  onCancel: () => void;
  onSave: (v: NewVehicle) => void;
}) {
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [bodyType, setBodyType] = useState<BodyType>(initial?.bodyType ?? "SUV");
  const [fuelType, setFuelType] = useState<FuelType>(initial?.fuelType ?? "electric");
  const [consumption, setConsumption] = useState(
    initial?.consumption != null ? String(initial.consumption) : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  const range = CONSUMPTION_RANGE[fuelType];

  const save = () => {
    // The same check the backoffice runs, so a car added here is one an admin
    // could have added — and the unit trap is caught before it reaches the
    // running-cost budget.
    const checked = validateVehicle({ make, model, fuelType, consumption, bodyType });
    if (!checked.ok) return setError(checked.error);
    setError(null);
    onSave({
      make: checked.vehicle.make,
      model: checked.vehicle.model,
      bodyType: checked.vehicle.bodyType,
      fuelType: checked.vehicle.fuelType,
      consumption: checked.vehicle.consumption,
    });
  };

  const input =
    "mt-1 w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add your car"
        className="relative z-10 my-10 w-full max-w-lg rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">Add your car</h2>
          <p className="mt-1 text-sm text-muted">
            We keep a short list of the cars most often novated, so plenty aren&apos;t on it.
            Tell us about yours and everything else works the same.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Make</span>
              <input
                autoFocus
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Skoda"
                className={input}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Model</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Enyaq"
                className={input}
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-ink">Fuel type</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FUEL_TYPES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFuelType(f)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                    fuelType === f
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
                  }`}
                >
                  {FUEL_LABEL[f]}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[11px] text-muted">
              Decides the FBT treatment. Only battery-electric is exempt.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Body type</span>
              <select
                value={bodyType}
                onChange={(e) => setBodyType(e.target.value as BodyType)}
                className={input}
              >
                {BODY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-muted">Picks the drawing.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Combined consumption</span>
              <span className="mt-1 flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 focus-within:border-accent">
                <input
                  type="number"
                  step="0.1"
                  value={consumption}
                  onChange={(e) => setConsumption(e.target.value)}
                  placeholder={String(Math.round(((range.min + range.max) / 2) * 10) / 10)}
                  className="w-full bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
                />
                <span className="whitespace-nowrap text-xs text-muted">
                  {consumptionUnit(fuelType)}
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted">
                From the brochure or the Green Vehicle Guide.
              </span>
            </label>
          </div>

          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
            <strong className="text-subtle">Why the consumption matters.</strong> It is the one
            figure here that changes a number. Without it we budget on a class average, which at
            15,000km a year is hundreds of dollars out — and the running-cost checks on your
            quotes are measured against that budget.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            Add this car
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <span className="text-[11px] text-muted">
            We&apos;ll check it and add it to the list for everyone.
          </span>
        </div>
      </div>
    </div>
  );
}
