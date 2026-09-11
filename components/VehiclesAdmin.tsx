"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminTabs from "./AdminTabs";
import VehicleArt from "./VehicleArt";
import { fmtDate } from "@/lib/au/format";
import {
  BODY_TYPES,
  CONSUMPTION_RANGE,
  FUEL_TYPES,
  consumptionUnit,
  vehicleSlug,
} from "@/lib/au/vehicles";
import { IMAGE_SPEC, vehicleImagePrompt } from "@/lib/au/vehicleImagePrompt";
import {
  clearVehicleImage,
  deleteVehicle,
  revertVehicle,
  saveVehicle,
  setVehicleActive,
  uploadVehicleImage,
  type VehicleRow,
} from "@/app/actions/vehicles";

/**
 * Managing the catalogue the picker offers.
 *
 * This is a live list: what is here is what users choose from, so the table
 * leads with the state that changes what they see — whether a vehicle is
 * showing at all, and whether it has artwork yet. The rest is spec.
 *
 * Two things are deliberately hard to do by accident. A vehicle a saved lease
 * names is hidden rather than deleted, because the car at the top of someone's
 * page should not vanish. And a row edited here is left alone by the deploy
 * seed from then on, which the table says out loud — otherwise the next
 * release would quietly undo the correction and nobody would know.
 */

const FUEL_LABEL: Record<string, string> = {
  electric: "Electric",
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  phev: "Plug-in hybrid",
};

type Origin = "all" | "catalogue" | "added" | "edited";
type Art = "all" | "has" | "missing";
type Shown = "all" | "active" | "hidden";
type Sort = "make" | "consumption" | "updated";

interface Draft {
  originalId?: string;
  id: string;
  make: string;
  model: string;
  fuelType: string;
  consumption: string;
  bodyType: string;
  notes: string;
  active: boolean;
}

const blankDraft = (): Draft => ({
  id: "",
  make: "",
  model: "",
  fuelType: "electric",
  consumption: "",
  bodyType: "SUV",
  notes: "",
  active: true,
});

const draftFrom = (v: VehicleRow): Draft => ({
  originalId: v.id,
  id: v.id,
  make: v.make,
  model: v.model,
  fuelType: v.fuel_type,
  consumption: String(Number(v.consumption)),
  bodyType: v.body_type,
  notes: v.notes ?? "",
  active: v.active,
});

function Pill({ tone, children }: { tone: "muted" | "warn" | "good" | "info"; children: React.ReactNode }) {
  const cls = {
    muted: "bg-panel-3 text-muted",
    warn: "bg-warning-subtle text-warning-text",
    good: "bg-success-subtle text-success-text",
    info: "bg-accent-subtle text-accent",
  }[tone];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

const selectCls =
  "rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent";
const inputCls =
  "w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";

export default function VehiclesAdmin({ vehicles }: { vehicles: VehicleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState("all");
  const [body, setBody] = useState("all");
  const [art, setArt] = useState<Art>("all");
  const [shown, setShown] = useState<Shown>("all");
  const [origin, setOrigin] = useState<Origin>("all");
  const [sort, setSort] = useState<Sort>("make");

  const stats = useMemo(
    () => ({
      total: vehicles.length,
      active: vehicles.filter((v) => v.active).length,
      art: vehicles.filter((v) => v.has_image).length,
      edited: vehicles.filter((v) => v.edited).length,
      added: vehicles.filter((v) => v.source === "admin").length,
    }),
    [vehicles],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const words = needle.split(/\s+/).filter(Boolean);
    const out = vehicles.filter((v) => {
      const hay = `${v.make} ${v.model} ${v.id} ${v.notes ?? ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
      if (fuel !== "all" && v.fuel_type !== fuel) return false;
      if (body !== "all" && v.body_type !== body) return false;
      if (art === "has" && !v.has_image) return false;
      if (art === "missing" && v.has_image) return false;
      if (shown === "active" && !v.active) return false;
      if (shown === "hidden" && v.active) return false;
      if (origin === "added" && v.source !== "admin") return false;
      if (origin === "catalogue" && v.source !== "seed") return false;
      if (origin === "edited" && !v.edited) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort === "consumption") return Number(a.consumption) - Number(b.consumption);
      if (sort === "updated") return b.updated_at.localeCompare(a.updated_at);
      return a.make.localeCompare(b.make) || a.model.localeCompare(b.model);
    });
  }, [vehicles, q, fuel, body, art, shown, origin, sort]);

  const filtered = rows.length !== vehicles.length;
  const clearFilters = () => {
    setQ("");
    setFuel("all");
    setBody("all");
    setArt("all");
    setShown("all");
    setOrigin("all");
  };

  /** Every mutation goes through here: one place for the busy state, the
   *  error banner and the refresh. */
  const run = async (
    id: string,
    fn: () => Promise<{ ok?: boolean; error?: string }>,
    done?: string,
  ) => {
    setError(null);
    setNote(null);
    setBusy(id);
    try {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return false;
      }
      if (done) setNote(done);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const upload = (id: string, file: File) => {
    const fd = new FormData();
    fd.set("image", file);
    return run(id, () => uploadVehicleImage(id, fd));
  };

  const remove = async (v: VehicleRow) => {
    const willHide = v.source !== "admin" || v.in_use > 0;
    const warning = willHide
      ? v.in_use > 0
        ? `${v.make} ${v.model} is named by ${v.in_use} saved lease${v.in_use === 1 ? "" : "s"}, so it will be hidden from the picker rather than deleted. Those leases keep the car. Go on?`
        : `${v.make} ${v.model} came from the code catalogue, so it will be hidden rather than deleted — a deploy would only put it back. Go on?`
      : `Delete ${v.make} ${v.model} for good?`;
    if (!confirm(warning)) return;
    await run(v.id, () => deleteVehicle(v.id), willHide ? "Hidden from the picker." : "Deleted.");
  };

  const save = async () => {
    if (!draft) return;
    const ok = await run(draft.originalId ?? "new", () =>
      saveVehicle(
        {
          id: draft.originalId ?? draft.id,
          make: draft.make,
          model: draft.model,
          fuelType: draft.fuelType,
          consumption: draft.consumption,
          bodyType: draft.bodyType,
          notes: draft.notes,
          active: draft.active,
        },
        draft.originalId,
      ),
      draft.originalId ? "Saved. The picker has it now." : "Added to the catalogue.",
    );
    if (ok) setDraft(null);
  };

  const editing = draft?.originalId ? vehicles.find((v) => v.id === draft.originalId) : null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-1 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Your leases
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-ink">Vehicles</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The list the picker offers. Changes are live — there is no publish step. A vehicle you
        edit here stops being overwritten by the code catalogue on deploy, so a correction
        sticks.
      </p>

      <div className="mt-6">
        <AdminTabs active="vehicles" />
      </div>

      {/* ── Where the catalogue stands ──────────────────────────────────── */}
      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { k: "In the catalogue", v: stats.total },
          { k: "Showing in the picker", v: stats.active },
          { k: "With artwork", v: `${stats.art} of ${stats.total}` },
          { k: "Edited here", v: stats.edited },
          { k: "Added here", v: stats.added },
        ].map((s) => (
          <div key={s.k} className="rounded-lg border border-line bg-panel px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{s.k}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{s.v}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger-subtle px-4 py-2.5 text-sm text-danger-text">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="mb-4 rounded-lg border border-success/40 bg-success-subtle px-4 py-2.5 text-sm text-success-text">
          {note}
        </p>
      )}

      {/* ── Finding one ─────────────────────────────────────────────────── */}
      {/* The search and the primary action keep their own row so neither is
          pushed around by the filters wrapping. */}
      <div className="mb-2 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search make, model, id or notes"
          aria-label="Search vehicles"
          className="min-w-[12rem] flex-1 rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setDraft(blankDraft())}
          className="whitespace-nowrap rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
        >
          + Add a vehicle
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={fuel} onChange={(e) => setFuel(e.target.value)} aria-label="Filter by fuel type" className={selectCls}>
          <option value="all">Any fuel</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_LABEL[f]}
            </option>
          ))}
        </select>
        <select value={body} onChange={(e) => setBody(e.target.value)} aria-label="Filter by body type" className={selectCls}>
          <option value="all">Any body</option>
          {BODY_TYPES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={art} onChange={(e) => setArt(e.target.value as Art)} aria-label="Filter by artwork" className={selectCls}>
          <option value="all">Any artwork</option>
          <option value="missing">Needs artwork</option>
          <option value="has">Has artwork</option>
        </select>
        <select value={shown} onChange={(e) => setShown(e.target.value as Shown)} aria-label="Filter by visibility" className={selectCls}>
          <option value="all">Shown and hidden</option>
          <option value="active">Showing</option>
          <option value="hidden">Hidden</option>
        </select>
        <select value={origin} onChange={(e) => setOrigin(e.target.value as Origin)} aria-label="Filter by origin" className={selectCls}>
          <option value="all">Any origin</option>
          <option value="catalogue">From the code catalogue</option>
          <option value="added">Added here</option>
          <option value="edited">Edited here</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={selectCls}>
          <option value="make">Make and model</option>
          <option value="consumption">Consumption</option>
          <option value="updated">Recently changed</option>
        </select>
      </div>

      <p className="mb-2 text-xs text-muted">
        {rows.length} of {vehicles.length} shown
        {filtered && (
          <button type="button" onClick={clearFilters} className="ml-2 font-medium text-accent hover:underline">
            Clear filters
          </button>
        )}
      </p>

      {/* ── The catalogue ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="w-24 px-3 py-2 font-semibold">Artwork</th>
              <th className="px-3 py-2 font-semibold">Vehicle</th>
              <th className="px-3 py-2 font-semibold">Fuel</th>
              <th className="px-3 py-2 text-right font-semibold">Consumption</th>
              <th className="px-3 py-2 font-semibold">Body</th>
              <th className="px-3 py-2 font-semibold">State</th>
              <th className="px-3 py-2 text-right font-semibold">Changed</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((v) => (
              <tr key={v.id} className={`align-middle ${v.active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2">
                  {/* The thumbnail is the upload control: 44 images to fit is a
                      lot of clicking otherwise. Every car shows a picture now —
                      its own or the placeholder — so the affordance has to come
                      from the hover state rather than from empty space. */}
                  <label
                    title={v.has_image ? "Replace the artwork" : "Upload artwork"}
                    className="group relative flex h-12 w-20 cursor-pointer items-center justify-center overflow-hidden rounded border border-line bg-panel-2 transition hover:border-accent"
                  >
                    <span className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-[#091e42]/54 text-[10px] font-semibold text-white group-hover:flex">
                      {v.has_image ? "Replace" : "Upload"}
                    </span>
                    {busy === v.id ? (
                      <span className="text-[10px] text-muted">Working…</span>
                    ) : (
                      <VehicleArt
                        src={
                          v.has_image
                            ? `/api/vehicle-image/${v.id}?v=${encodeURIComponent(v.image_updated_at ?? "")}`
                            : null
                        }
                        alt={`${v.make} ${v.model}`}
                        bodyType={v.body_type}
                      />
                    )}
                    <input
                      type="file"
                      accept="image/webp,image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void upload(v.id, f);
                      }}
                    />
                  </label>
                </td>

                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDraft(draftFrom(v))}
                    className="text-left font-medium text-accent hover:underline"
                  >
                    {v.make} {v.model}
                  </button>
                  <p className="text-[11px] text-muted">{v.id}</p>
                  {v.notes && <p className="mt-0.5 max-w-md text-[11px] text-subtle">{v.notes}</p>}
                </td>

                <td className="px-3 py-2 text-subtle">{FUEL_LABEL[v.fuel_type] ?? v.fuel_type}</td>

                <td className="px-3 py-2 text-right tabular-nums text-subtle">
                  {Number(v.consumption)}{" "}
                  <span className="text-[11px] text-muted">{consumptionUnit(v.fuel_type as never)}</span>
                </td>

                <td className="px-3 py-2 text-subtle">{v.body_type}</td>

                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {!v.active && <Pill tone="warn">Hidden</Pill>}
                    {v.source === "admin" ? (
                      <Pill tone="info">Added here</Pill>
                    ) : (
                      v.edited && <Pill tone="good">Edited</Pill>
                    )}
                    {v.in_use > 0 && <Pill tone="muted">{v.in_use} in use</Pill>}
                  </div>
                </td>

                <td className="px-3 py-2 text-right text-[11px] text-muted">{fmtDate(v.updated_at)}</td>

                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => void run(v.id, () => setVehicleActive(v.id, !v.active))}
                      className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-panel-2 hover:text-ink"
                    >
                      {v.active ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(draftFrom(v))}
                      className="rounded border border-line bg-panel-2 px-2 py-1 text-xs font-medium text-ink transition hover:bg-panel-3"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted">
                  Nothing matches that.{" "}
                  <button type="button" onClick={clearFilters} className="font-medium text-accent hover:underline">
                    Clear the filters
                  </button>{" "}
                  or{" "}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...blankDraft(), model: q.trim() })}
                    className="font-medium text-accent hover:underline"
                  >
                    add it
                  </button>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <Editor
          draft={draft}
          row={editing ?? null}
          busy={busy !== null}
          error={error}
          onChange={setDraft}
          onClose={() => {
            setDraft(null);
            setError(null);
          }}
          onSave={save}
          onDelete={editing ? () => void remove(editing).then(() => setDraft(null)) : undefined}
          onRevert={
            editing && editing.source === "seed" && editing.edited
              ? async () => {
                  if (await run(editing.id, () => revertVehicle(editing.id), "Back to the code catalogue.")) {
                    setDraft(null);
                  }
                }
              : undefined
          }
          onClearImage={
            editing?.has_image
              ? () => void run(editing.id, () => clearVehicleImage(editing.id))
              : undefined
          }
          onUpload={editing ? (f: File) => void upload(editing.id, f) : undefined}
        />
      )}
    </div>
  );
}

/**
 * The generation prompt for this car.
 *
 * Built from the draft rather than the saved row, so changing the body type
 * and reading the prompt back agree with each other. Shown on demand: it is a
 * paragraph of boilerplate, and only useful at the moment you are about to
 * generate something.
 */
function PromptPanel({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const prompt = vehicleImagePrompt({
    make: draft.make,
    model: draft.model,
    fuelType: draft.fuelType,
    bodyType: draft.bodyType,
  });
  const filename = `${draft.originalId ?? (vehicleSlug(draft.make, draft.model) || "vehicle")}.webp`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the textarea below is selectable, so say so
      // rather than pretending it worked.
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Generation prompt</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-ink">
          Hide
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        The same template as every other car in the catalogue — they sit side by side in the
        picker, so the angle, lighting and crop have to match.
      </p>
      <textarea
        readOnly
        value={prompt}
        rows={5}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full resize-y rounded-md border border-line bg-panel px-2.5 py-2 font-mono text-[11px] leading-relaxed text-subtle outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-panel-3"
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
        <span className="text-[11px] text-muted">
          Save as <code className="text-subtle">{filename}</code> — {IMAGE_SPEC.format},{" "}
          {IMAGE_SPEC.size}, {IMAGE_SPEC.maxBytes}. Then upload it above.
        </span>
      </div>
    </div>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────

function Editor({
  draft,
  row,
  busy,
  error,
  onChange,
  onClose,
  onSave,
  onDelete,
  onRevert,
  onClearImage,
  onUpload,
}: {
  draft: Draft;
  row: VehicleRow | null;
  busy: boolean;
  error: string | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onRevert?: () => void;
  onClearImage?: () => void;
  onUpload?: (f: File) => void;
}) {
  const first = useRef<HTMLInputElement>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const range = CONSUMPTION_RANGE[draft.fuelType as keyof typeof CONSUMPTION_RANGE];
  const isNew = !draft.originalId;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#091e42]/54 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Add a vehicle" : `Edit ${draft.make} ${draft.model}`}
        className="my-8 w-full max-w-2xl rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold text-ink">
            {isNew ? "Add a vehicle" : `${draft.make} ${draft.model}`}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {error}
            </p>
          )}

          {/* Artwork — only once the vehicle exists to attach it to. */}
          {row ? (
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2">
                <VehicleArt
                  src={
                    row.has_image
                      ? `/api/vehicle-image/${row.id}?v=${encodeURIComponent(row.image_updated_at ?? "")}`
                      : null
                  }
                  alt={`${row.make} ${row.model}`}
                  bodyType={row.body_type}
                />
              </div>
              <div className="text-sm">
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-panel-3">
                    {row.has_image ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/webp,image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onUpload?.(f);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPrompt((v) => !v)}
                    className="rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-panel-3"
                  >
                    {showPrompt ? "Hide prompt" : "Prompt"}
                  </button>
                  {onClearImage && (
                    <button
                      type="button"
                      onClick={onClearImage}
                      className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  WebP, PNG or JPEG, under 2MB. Without one the picker draws a silhouette.
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] text-muted">
              Add it first, then its artwork — the generation prompt is on the editor once it
              exists.
            </p>
          )}

          {row && showPrompt && <PromptPanel draft={draft} onClose={() => setShowPrompt(false)} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Make</span>
              <input ref={first} value={draft.make} onChange={(e) => set("make", e.target.value)} className={`mt-1 ${inputCls}`} placeholder="Kia" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Model</span>
              <input value={draft.model} onChange={(e) => set("model", e.target.value)} className={`mt-1 ${inputCls}`} placeholder="EV3" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Fuel type</span>
              <select value={draft.fuelType} onChange={(e) => set("fuelType", e.target.value)} className={`mt-1 ${inputCls}`}>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {FUEL_LABEL[f]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-muted">
                Decides the FBT treatment. Only battery-electric is exempt.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Body type</span>
              <select value={draft.bodyType} onChange={(e) => set("bodyType", e.target.value)} className={`mt-1 ${inputCls}`}>
                {BODY_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-muted">Picks the silhouette shown without artwork.</span>
            </label>
          </div>

          <label className="block max-w-xs">
            <span className="text-sm font-medium text-ink">Combined consumption</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={draft.consumption}
                onChange={(e) => set("consumption", e.target.value)}
                className={inputCls}
                placeholder={String(range.min + 2)}
              />
              <span className="whitespace-nowrap text-sm text-muted">{range.unit}</span>
            </div>
            <span className="mt-1 block text-[11px] text-muted">
              Green Vehicle Guide combined figure. Drives the fuel budget, so a wrong unit here is
              worth hundreds a year — expected between {range.min} and {range.max}.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Notes</span>
            <input
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={`mt-1 ${inputCls}`}
              placeholder="Where the figure came from, or which variant this is"
            />
            <span className="mt-1 block text-[11px] text-muted">Internal only. Never shown to users.</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} className="accent-[var(--color-accent)]" />
            Show in the picker
          </label>

          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] text-muted">
            {isNew ? (
              <>
                Its id will be <code className="text-subtle">{vehicleSlug(draft.make, draft.model) || "…"}</code>, and
                it never changes after this — saved leases point at it.
              </>
            ) : (
              <>
                Id <code className="text-subtle">{draft.id}</code>, fixed because saved leases point at it.
                Saving stops the deploy seed overwriting this row.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
          >
            {busy ? "Saving…" : isNew ? "Add to the catalogue" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink">
            Cancel
          </button>
          {onRevert && (
            <button
              type="button"
              onClick={onRevert}
              title="Restore the values in lib/au/vehicles.ts and let deploys update it again"
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-subtle transition hover:bg-panel-2"
            >
              Revert to catalogue
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
            >
              {row && row.source === "admin" && row.in_use === 0 ? "Delete" : "Hide"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
