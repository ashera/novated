import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Serve a vehicle's artwork from the database.
 *
 * 404 when a vehicle has no image yet, which is the normal state until one is
 * uploaded — the picker falls back to its own drawing rather than showing a
 * broken frame. Cached hard: the bytes only change when someone uploads a new
 * one, and the cache is busted by the ?v= stamp the picker appends.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await query<{ image: Buffer | null; image_mime: string | null }>(
    "select image, image_mime from vehicles where id = $1 and active",
    [id],
  );
  const row = r.rows[0];
  if (!row?.image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(row.image), {
    headers: {
      "content-type": row.image_mime || "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(row.image.length),
    },
  });
}
