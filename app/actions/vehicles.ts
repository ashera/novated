"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import { VEHICLES, validateVehicle, type VehicleInput } from "@/lib/au/vehicles";

/**
 * Managing the vehicle catalogue.
 *
 * The table is what the picker reads, so everything here is a live change to
 * what users see. Two rules keep it safe:
 *
 *   - every write sets `edited`, which tells the deploy seed to leave the row
 *     alone from then on (lib/migrations.ts). Without it, the next release
 *     would quietly undo the correction.
 *   - a seeded vehicle is never hard-deleted, because a saved lease may point
 *     at its id. It is deactivated instead: it leaves the picker, and a lease
 *     that already names it keeps its artwork and its spec.
 */

export interface VehicleRow {
  id: string;
  make: string;
  model: string;
  fuel_type: string;
  consumption: string;
  body_type: string;
  has_image: boolean;
  image_updated_at: string | null;
  active: boolean;
  source: string;
  edited: boolean;
  notes: string | null;
  updated_at: string;
  /** How many saved leases name this vehicle. Deleting one is not free. */
  in_use: number;
}

export interface VehicleResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

/** Everything in the catalogue — inactive rows included, because hiding one is
 *  a state the admin has to be able to see and undo. */
export async function listVehicles(): Promise<VehicleRow[]> {
  const r = await query<VehicleRow>(
    `select v.id, v.make, v.model, v.fuel_type, v.consumption, v.body_type,
            v.active, v.source, v.edited, v.notes, v.updated_at,
            v.image is not null as has_image, v.image_updated_at,
            (select count(*)::int from leases l
              where l.vehicle ->> 'vehicleId' = v.id) as in_use
       from vehicles v
      order by v.make, v.model`,
  );
  return r.rows;
}

/** Add a vehicle, or save changes to one. */
export async function saveVehicle(
  input: VehicleInput & { notes?: string; active?: boolean },
  originalId?: string,
): Promise<VehicleResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const checked = validateVehicle(input);
  if (!checked.ok) return { error: checked.error };
  const v = checked.vehicle;
  const notes = input.notes?.trim() || null;
  const active = input.active ?? true;

  // The id is derived from make and model, so a rename would change it — and
  // a saved lease points at the old one. Keep the id it was created with.
  const id = originalId ?? v.id;

  if (originalId) {
    const r = await query(
      `update vehicles
          set make = $1, model = $2, fuel_type = $3, consumption = $4, body_type = $5,
              notes = $6, active = $7, edited = true, updated_at = now()
        where id = $8`,
      [v.make, v.model, v.fuelType, v.consumption, v.bodyType, notes, active, id],
    );
    if (!r.rowCount) return { error: "That vehicle no longer exists." };
  } else {
    const clash = await query("select 1 from vehicles where id = $1", [id]);
    if (clash.rowCount) {
      return { error: `There's already a ${v.make} ${v.model} in the catalogue.` };
    }
    await query(
      `insert into vehicles (id, make, model, fuel_type, consumption, body_type, notes, active, source, edited)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'admin',true)`,
      [id, v.make, v.model, v.fuelType, v.consumption, v.bodyType, notes, active],
    );
  }

  revalidatePath("/admin/vehicles");
  return { ok: true, id };
}

/** Show or hide a vehicle in the picker. */
export async function setVehicleActive(id: string, active: boolean): Promise<VehicleResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const r = await query(
    "update vehicles set active = $1, edited = true, updated_at = now() where id = $2",
    [active, id],
  );
  if (!r.rowCount) return { error: "Unknown vehicle." };
  revalidatePath("/admin/vehicles");
  return { ok: true };
}

/**
 * Remove a vehicle.
 *
 * Only a vehicle an admin added and nobody is using is actually deleted.
 * Anything from the seed catalogue, or anything a saved lease names, is
 * deactivated instead — a hard delete would leave those leases pointing at an
 * id that resolves to nothing, and the car would vanish from the top of their
 * page.
 */
export async function deleteVehicle(id: string): Promise<VehicleResult & { hidden?: boolean }> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const r = await query<{ source: string; in_use: number }>(
    `select v.source,
            (select count(*)::int from leases l where l.vehicle ->> 'vehicleId' = v.id) as in_use
       from vehicles v where v.id = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return { error: "Unknown vehicle." };

  if (row.source === "admin" && row.in_use === 0) {
    await query("delete from vehicles where id = $1", [id]);
    revalidatePath("/admin/vehicles");
    return { ok: true };
  }

  await query(
    "update vehicles set active = false, edited = true, updated_at = now() where id = $1",
    [id],
  );
  revalidatePath("/admin/vehicles");
  return { ok: true, hidden: true };
}

/** Put a seeded vehicle back to the values in lib/au/vehicles.ts, and hand it
 *  back to the deploy seed. The artwork is left alone — it was never seeded. */
export async function revertVehicle(id: string): Promise<VehicleResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const seed = VEHICLES.find((v) => v.id === id);
  if (!seed) return { error: "That one isn't in the code catalogue, so there's nothing to revert to." };

  await query(
    `update vehicles
        set make = $1, model = $2, fuel_type = $3, consumption = $4, body_type = $5,
            notes = null, active = true, edited = false, updated_at = now()
      where id = $6`,
    [seed.make, seed.model, seed.fuelType, seed.consumption, seed.bodyType, id],
  );
  revalidatePath("/admin/vehicles");
  return { ok: true };
}

const MAX_BYTES = 2_000_000;
const ALLOWED = ["image/webp", "image/png", "image/jpeg"];

/** Upload artwork for one vehicle. Admin only — these images are public. */
export async function uploadVehicleImage(
  id: string,
  form: FormData,
): Promise<VehicleResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!ALLOWED.includes(file.type)) {
    return { error: `${file.type || "That file"} isn't supported — use WebP, PNG or JPEG.` };
  }
  if (file.size > MAX_BYTES) {
    return { error: `That image is ${(file.size / 1e6).toFixed(1)}MB. Keep it under 2MB.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const r = await query(
    `update vehicles set image = $1, image_mime = $2, image_updated_at = now(), updated_at = now()
      where id = $3`,
    [bytes, file.type, id],
  );
  if (!r.rowCount) return { error: "Unknown vehicle." };
  revalidatePath("/admin/vehicles");
  return { ok: true };
}

export async function clearVehicleImage(id: string): Promise<VehicleResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query(
    "update vehicles set image = null, image_mime = null, image_updated_at = null where id = $1",
    [id],
  );
  revalidatePath("/admin/vehicles");
  return { ok: true };
}
