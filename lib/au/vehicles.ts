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
// `make` and `model` are the strings the image provider expects, so adding a
// vehicle is one line here and nothing else.

import type { FuelType } from "./novated";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  fuelType: FuelType;
  /** L/100km, or kWh/100km when fuelType is "electric". */
  consumption: number;
  bodyType: "SUV" | "Hatch" | "Sedan" | "Wagon" | "Ute" | "People mover";
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

export function findVehicle(id: string | undefined | null): Vehicle | null {
  if (!id) return null;
  return VEHICLES.find((v) => v.id === id) ?? null;
}

/** Makes, in the order they should be offered: alphabetical, but grouped so the
 *  electric-heavy brands people actually novate come first. */
export function vehicleMakes(): string[] {
  return [...new Set(VEHICLES.map((v) => v.make))].sort((a, b) => a.localeCompare(b));
}

export function vehiclesForMake(make: string): Vehicle[] {
  return VEHICLES.filter((v) => v.make === make).sort((a, b) => a.model.localeCompare(b.model));
}
