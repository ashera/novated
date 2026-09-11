// A curated catalogue of the cars Australians actually novate.
//
// Deliberately NOT a price list. The same model varies by thousands between
// dealers, and a price we invented would be worse than no price at all — the
// drive-away figure stays something the user reads off their own quote.
//
// What the catalogue is for:
//   1. an image, so the page shows the car they are actually buying
//   2. fuel type, so the FBT treatment follows from the car rather than a guess
//   3. energy consumption, which is a real accuracy fix — the engine otherwise
//      assumes every EV uses 16.5 kWh/100km and every petrol car 8.0 L/100km,
//      and at 15,000 km a year that is hundreds of dollars of error in the
//      running-cost budget the padding finding is measured against
//
// `consumption` is the combined-cycle figure: litres per 100km for anything
// that burns fuel, kWh per 100km for a battery-electric car. Figures are
// manufacturer/Green Vehicle Guide combined numbers and are indicative — a real
// car driven in real traffic will differ, which is why the user can override.
//
// This list is the SEED, not the running catalogue. It is upserted into the
// `vehicles` table on every deploy and the picker reads the table, so an admin
// can add a car, fix a consumption figure or hide a model without a release.
// A row an admin has touched is left alone by the seed from then on — see
// seedVehicles in lib/migrations.ts, and revertVehicle to put one back.

import type { FuelType } from "./novated";

export const BODY_TYPES = ["SUV", "Hatch", "Sedan", "Wagon", "Ute", "People mover"] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const FUEL_TYPES: FuelType[] = ["electric", "petrol", "diesel", "hybrid", "phev"];

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  fuelType: FuelType;
  /** L/100km, or kWh/100km when fuelType is "electric". */
  consumption: number;
  bodyType: BodyType;
}

export const VEHICLES: Vehicle[] = [
  // ── Battery electric — the bulk of novated demand since the FBT exemption ──
  { id: "tesla-model-3", make: "Tesla", model: "Model 3", fuelType: "electric", consumption: 13.2, bodyType: "Sedan" },
  { id: "tesla-model-y", make: "Tesla", model: "Model Y", fuelType: "electric", consumption: 14.9, bodyType: "SUV" },
  { id: "byd-atto-3", make: "BYD", model: "Atto 3", fuelType: "electric", consumption: 16.0, bodyType: "SUV" },
  { id: "byd-dolphin", make: "BYD", model: "Dolphin", fuelType: "electric", consumption: 15.9, bodyType: "Hatch" },
  { id: "byd-seal", make: "BYD", model: "Seal", fuelType: "electric", consumption: 15.5, bodyType: "Sedan" },
  { id: "byd-sealion-7", make: "BYD", model: "Sealion 7", fuelType: "electric", consumption: 17.5, bodyType: "SUV" },
  { id: "kia-ev5", make: "Kia", model: "EV5", fuelType: "electric", consumption: 17.8, bodyType: "SUV" },
  { id: "kia-ev6", make: "Kia", model: "EV6", fuelType: "electric", consumption: 16.5, bodyType: "SUV" },
  { id: "kia-niro-ev", make: "Kia", model: "Niro", fuelType: "electric", consumption: 16.2, bodyType: "SUV" },
  { id: "hyundai-ioniq-5", make: "Hyundai", model: "Ioniq 5", fuelType: "electric", consumption: 16.8, bodyType: "SUV" },
  { id: "hyundai-kona-electric", make: "Hyundai", model: "Kona", fuelType: "electric", consumption: 14.9, bodyType: "SUV" },
  { id: "mg-4", make: "MG", model: "MG4", fuelType: "electric", consumption: 16.0, bodyType: "Hatch" },
  { id: "mg-zs-ev", make: "MG", model: "ZS EV", fuelType: "electric", consumption: 17.0, bodyType: "SUV" },
  { id: "polestar-2", make: "Polestar", model: "2", fuelType: "electric", consumption: 15.5, bodyType: "Sedan" },
  { id: "volvo-ex30", make: "Volvo", model: "EX30", fuelType: "electric", consumption: 15.5, bodyType: "SUV" },
  { id: "volvo-ex40", make: "Volvo", model: "EX40", fuelType: "electric", consumption: 17.0, bodyType: "SUV" },
  { id: "mercedes-eqa", make: "Mercedes-Benz", model: "EQA", fuelType: "electric", consumption: 17.4, bodyType: "SUV" },
  { id: "mercedes-eqb", make: "Mercedes-Benz", model: "EQB", fuelType: "electric", consumption: 18.6, bodyType: "SUV" },
  { id: "bmw-ix1", make: "BMW", model: "iX1", fuelType: "electric", consumption: 17.3, bodyType: "SUV" },
  { id: "bmw-i4", make: "BMW", model: "i4", fuelType: "electric", consumption: 16.1, bodyType: "Sedan" },
  { id: "cupra-born", make: "Cupra", model: "Born", fuelType: "electric", consumption: 15.8, bodyType: "Hatch" },
  { id: "nissan-leaf", make: "Nissan", model: "Leaf", fuelType: "electric", consumption: 16.8, bodyType: "Hatch" },
  { id: "peugeot-e-2008", make: "Peugeot", model: "e-2008", fuelType: "electric", consumption: 16.4, bodyType: "SUV" },
  { id: "smart-3", make: "Smart", model: "#3", fuelType: "electric", consumption: 16.4, bodyType: "SUV" },
  { id: "zeekr-x", make: "Zeekr", model: "X", fuelType: "electric", consumption: 16.6, bodyType: "SUV" },

  // ── Plug-in hybrids — no longer FBT exempt, which the engine warns about ──
  { id: "byd-shark-6", make: "BYD", model: "Shark 6", fuelType: "phev", consumption: 2.0, bodyType: "Ute" },
  { id: "mitsubishi-outlander-phev", make: "Mitsubishi", model: "Outlander", fuelType: "phev", consumption: 1.5, bodyType: "SUV" },
  { id: "byd-sealion-6", make: "BYD", model: "Sealion 6", fuelType: "phev", consumption: 1.1, bodyType: "SUV" },
  { id: "gwm-haval-h6-phev", make: "GWM", model: "Haval H6", fuelType: "phev", consumption: 1.1, bodyType: "SUV" },

  // ── Hybrids and petrol ──
  { id: "toyota-rav4-hybrid", make: "Toyota", model: "RAV4", fuelType: "hybrid", consumption: 4.7, bodyType: "SUV" },
  { id: "toyota-corolla-hybrid", make: "Toyota", model: "Corolla", fuelType: "hybrid", consumption: 4.0, bodyType: "Hatch" },
  { id: "toyota-camry-hybrid", make: "Toyota", model: "Camry", fuelType: "hybrid", consumption: 4.0, bodyType: "Sedan" },
  { id: "toyota-kluger", make: "Toyota", model: "Kluger", fuelType: "hybrid", consumption: 5.6, bodyType: "SUV" },
  { id: "honda-cr-v", make: "Honda", model: "CR-V", fuelType: "petrol", consumption: 7.1, bodyType: "SUV" },
  { id: "mazda-cx-5", make: "Mazda", model: "CX-5", fuelType: "petrol", consumption: 7.4, bodyType: "SUV" },
  { id: "mazda-cx-30", make: "Mazda", model: "CX-30", fuelType: "petrol", consumption: 6.5, bodyType: "SUV" },
  { id: "hyundai-tucson", make: "Hyundai", model: "Tucson", fuelType: "petrol", consumption: 8.1, bodyType: "SUV" },
  { id: "kia-sportage", make: "Kia", model: "Sportage", fuelType: "petrol", consumption: 8.1, bodyType: "SUV" },
  { id: "subaru-forester", make: "Subaru", model: "Forester", fuelType: "petrol", consumption: 7.4, bodyType: "SUV" },
  { id: "volkswagen-golf", make: "Volkswagen", model: "Golf", fuelType: "petrol", consumption: 6.0, bodyType: "Hatch" },

  // ── Diesel utes and 4WDs ──
  { id: "ford-ranger", make: "Ford", model: "Ranger", fuelType: "diesel", consumption: 7.6, bodyType: "Ute" },
  { id: "toyota-hilux", make: "Toyota", model: "HiLux", fuelType: "diesel", consumption: 7.2, bodyType: "Ute" },
  { id: "isuzu-d-max", make: "Isuzu", model: "D-Max", fuelType: "diesel", consumption: 8.0, bodyType: "Ute" },
  { id: "toyota-prado", make: "Toyota", model: "Prado", fuelType: "diesel", consumption: 7.6, bodyType: "SUV" },
];

// ── Reading a catalogue ─────────────────────────────────────────────────────
//
// These take the list to search rather than closing over VEHICLES, because at
// runtime the list comes from the database and only the tests and the seed use
// the constant.

export function findVehicle(list: Vehicle[], id: string | undefined | null): Vehicle | null {
  if (!id) return null;
  return list.find((v) => v.id === id) ?? null;
}

/** Makes, alphabetically. */
export function vehicleMakes(list: Vehicle[]): string[] {
  return [...new Set(list.map((v) => v.make))].sort((a, b) => a.localeCompare(b));
}

export function vehiclesForMake(list: Vehicle[], make: string): Vehicle[] {
  return list.filter((v) => v.make === make).sort((a, b) => a.model.localeCompare(b.model));
}

// ── Adding and editing one ──────────────────────────────────────────────────

/**
 * What a combined-cycle figure can plausibly be, in that fuel's own unit.
 *
 * A guard against typos, not a statement about what cars exist — someone
 * entering a petrol car's 7.4 while "electric" is selected would otherwise
 * quietly cut the running-cost budget by half, and nothing downstream would
 * look wrong enough to notice.
 */
export const CONSUMPTION_RANGE: Record<FuelType, { min: number; max: number; unit: string }> = {
  electric: { min: 8, max: 35, unit: "kWh/100km" },
  phev: { min: 0.3, max: 6, unit: "L/100km" },
  hybrid: { min: 2, max: 12, unit: "L/100km" },
  petrol: { min: 3, max: 25, unit: "L/100km" },
  diesel: { min: 3, max: 25, unit: "L/100km" },
};

export const consumptionUnit = (f: FuelType) => CONSUMPTION_RANGE[f].unit;

/** How to name a fuel type mid-sentence. */
export const FUEL_PHRASE: Record<FuelType, string> = {
  electric: "a battery-electric car",
  phev: "a plug-in hybrid",
  hybrid: "a hybrid",
  petrol: "a petrol car",
  diesel: "a diesel car",
};

/** The id for a new vehicle: lowercase, hyphenated, ASCII. Stable enough to
 *  live in a saved lease, which is why it is derived once and then left. */
export function vehicleSlug(make: string, model: string): string {
  return `${make} ${model}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface VehicleInput {
  id?: string;
  make: string;
  model: string;
  fuelType: string;
  consumption: number | string;
  bodyType: string;
}

/** Check and normalise what came off the admin form. Pure, so the rules are
 *  testable and the same message reaches the UI wherever it is used. */
export function validateVehicle(
  input: VehicleInput,
): { ok: true; vehicle: Vehicle } | { ok: false; error: string } {
  const make = input.make?.trim() ?? "";
  const model = input.model?.trim() ?? "";
  if (!make) return { ok: false, error: "Give it a make." };
  if (!model) return { ok: false, error: "Give it a model." };
  if (make.length > 60 || model.length > 60) {
    return { ok: false, error: "Make and model need to be under 60 characters." };
  }

  const fuelType = input.fuelType as FuelType;
  if (!FUEL_TYPES.includes(fuelType)) {
    return { ok: false, error: `"${input.fuelType}" isn't a fuel type we handle.` };
  }

  const bodyType = input.bodyType as BodyType;
  if (!BODY_TYPES.includes(bodyType)) {
    return { ok: false, error: `"${input.bodyType}" isn't a body type we handle.` };
  }

  const consumption = Number(input.consumption);
  if (!Number.isFinite(consumption)) {
    return { ok: false, error: "Consumption needs to be a number." };
  }
  const range = CONSUMPTION_RANGE[fuelType];
  if (consumption < range.min || consumption > range.max) {
    return {
      ok: false,
      error: `The combined figure for ${FUEL_PHRASE[fuelType]} is quoted in ${range.unit}, so ${consumption} looks wrong — expected somewhere between ${range.min} and ${range.max}.`,
    };
  }

  const id = (input.id?.trim() || vehicleSlug(make, model)).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    return { ok: false, error: `"${id}" isn't a usable id — lowercase letters, numbers and hyphens only.` };
  }

  return {
    ok: true,
    vehicle: { id, make, model, fuelType, consumption: Math.round(consumption * 10) / 10, bodyType },
  };
}
