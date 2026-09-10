"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";

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
}

/** Everything in the picker, plus whether it has artwork yet. */
export async function listVehicles(): Promise<VehicleRow[]> {
  const r = await query<VehicleRow>(
    `select id, make, model, fuel_type, consumption, body_type, active,
            image is not null as has_image, image_updated_at
       from vehicles order by make, model`,
  );
  return r.rows;
}

const MAX_BYTES = 2_000_000;
const ALLOWED = ["image/webp", "image/png", "image/jpeg"];

/** Upload artwork for one vehicle. Admin only — these images are public. */
export async function uploadVehicleImage(
  id: string,
  form: FormData,
): Promise<{ ok?: boolean; error?: string }> {
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

export async function clearVehicleImage(id: string): Promise<{ ok?: boolean; error?: string }> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query(
    "update vehicles set image = null, image_mime = null, image_updated_at = null where id = $1",
    [id],
  );
  revalidatePath("/admin/vehicles");
  return { ok: true };
}
