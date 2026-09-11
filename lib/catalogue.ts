import { query } from "@/lib/db";
import { VEHICLES, type BodyType, type Vehicle } from "@/lib/au/vehicles";
import type { FuelType } from "@/lib/au/novated";

/**
 * The vehicle catalogue the picker offers.
 *
 * Read from the database, because an admin can add a car or correct a spec
 * between releases and the picker has to show it. Falls back to the code seed
 * if the database is unavailable — same reasoning as getActiveConfig and
 * listSources: a build that prerenders a page must not need a live connection,
 * and a user whose database is having a moment should still get a picker.
 */

interface CatalogueRow {
  id: string;
  make: string;
  model: string;
  fuel_type: string;
  consumption: string;
  body_type: string;
}

const toVehicle = (r: CatalogueRow): Vehicle => ({
  id: r.id,
  make: r.make,
  model: r.model,
  fuelType: r.fuel_type as FuelType,
  consumption: Number(r.consumption),
  bodyType: r.body_type as BodyType,
});

export async function getCatalogue(): Promise<Vehicle[]> {
  try {
    const r = await query<CatalogueRow>(
      `select id, make, model, fuel_type, consumption, body_type
         from vehicles where active order by make, model`,
    );
    return r.rows.length > 0 ? r.rows.map(toVehicle) : VEHICLES;
  } catch {
    return VEHICLES;
  }
}
