"use client";

import { useState, useTransition } from "react";
import AdminTabs from "./AdminTabs";
import Link from "next/link";
import {
  clearVehicleImage,
  uploadVehicleImage,
  type VehicleRow,
} from "@/app/actions/vehicles";

/** Upload and manage the picker's artwork. The vehicle list itself is seeded
 *  from code on every deploy; only the images are managed here. */
export default function VehiclesAdmin({ vehicles }: { vehicles: VehicleRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const withArt = vehicles.filter((v) => v.has_image).length;

  const upload = async (id: string, file: File) => {
    setError(null);
    setBusy(id);
    const fd = new FormData();
    fd.set("image", file);
    const res = await uploadVehicleImage(id, fd);
    setBusy(null);
    if (res.error) setError(`${id}: ${res.error}`);
    else startTransition(() => window.location.reload());
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-1 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Calculator</Link>
      </div>
      <h1 className="text-3xl font-bold text-ink">Vehicle artwork</h1>
      <p className="mt-2 max-w-2xl text-muted">
        The picker falls back to a drawn silhouette wherever there is no image, so this can be
        filled in gradually. <strong className="text-ink">{withArt}</strong> of{" "}
        <strong className="text-ink">{vehicles.length}</strong> done.
      </p>

      <div className="mt-6">
        <AdminTabs active="vehicles" />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger-subtle px-4 py-2.5 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <div key={v.id} className="rounded-xl border border-line bg-panel p-3 shadow-[var(--shadow-card)]">
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-panel-2">
              {v.has_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/vehicle-image/${v.id}?v=${encodeURIComponent(v.image_updated_at ?? "")}`}
                  alt={`${v.make} ${v.model}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted">No image yet</span>
              )}
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {v.make} {v.model}
              </span>
              <span className="text-[11px] text-muted">
                {v.fuel_type === "electric" ? `${v.consumption} kWh` : `${v.consumption} L`}
              </span>
            </div>
            <p className="text-[11px] text-muted">{v.body_type} · {v.id}</p>

            <div className="mt-2 flex items-center gap-2">
              <label className="cursor-pointer rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-panel-3">
                {busy === v.id ? "Uploading…" : v.has_image ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/webp,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(v.id, f);
                  }}
                />
              </label>
              {v.has_image && (
                <button
                  type="button"
                  onClick={async () => {
                    await clearVehicleImage(v.id);
                    window.location.reload();
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
