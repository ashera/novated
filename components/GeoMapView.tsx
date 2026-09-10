"use client";

import { useEffect, useMemo, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import CountryFlag from "@/components/CountryFlag";
import { countryName } from "@/lib/countryName";
import { NUMERIC_TO_ALPHA2 } from "@/lib/isoNumeric";
import world from "@/lib/world-110m.json";
import type { CountryCount, LocationPoint } from "@/lib/adminGeoCounts";

const W = 900;
const H = 450;

type Metric = "all" | "users" | "visitors";
type Tally = { users: number; visitors: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fc = feature(topo, topo.objects.countries) as any;
const projection = geoEqualEarth().fitExtent(
  [
    [8, 8],
    [W - 8, H - 8],
  ],
  fc,
);
const pathGen = geoPath(projection);
const FEATURES: { id: string; name: string; d: string | null }[] = fc.features.map(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (f: any) => ({ id: String(f.id).padStart(3, "0"), name: f.properties?.name ?? "", d: pathGen(f) }),
);

function valueFor(c: Tally | undefined, metric: Metric): number {
  if (!c) return 0;
  return metric === "users" ? c.users : metric === "visitors" ? c.visitors : c.users + c.visitors;
}

export default function GeoMapView({ counts, points }: { counts: CountryCount[]; points: LocationPoint[] }) {
  const [metric, setMetric] = useState<Metric>("all");
  const [showCities, setShowCities] = useState(true);
  // Render the d3/SVG map only on the client. It's purely presentational (no SEO
  // value) and the projected float coordinates can differ subtly between the server
  // and client render, which trips React's hydration check — so we skip SSR for it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const byAlpha2 = useMemo(() => {
    const m = new Map<string, CountryCount>();
    for (const c of counts) m.set(c.country, c);
    return m;
  }, [counts]);

  const max = useMemo(() => Math.max(1, ...counts.map((c) => valueFor(c, metric))), [counts, metric]);
  const pointMax = useMemo(() => Math.max(1, ...points.map((p) => valueFor(p, metric))), [points, metric]);

  const ranked = useMemo(
    () =>
      [...counts]
        .map((c) => ({ ...c, v: valueFor(c, metric) }))
        .filter((c) => c.v > 0)
        .sort((a, b) => b.v - a.v),
    [counts, metric],
  );

  const totals = useMemo(() => {
    const users = counts.reduce((s, c) => s + c.users, 0);
    const visitors = counts.reduce((s, c) => s + c.visitors, 0);
    return { users, visitors };
  }, [counts]);

  const fillFor = (alpha2: string | undefined) => {
    const v = valueFor(alpha2 ? byAlpha2.get(alpha2) : undefined, metric);
    if (v <= 0) return "#141c2e";
    const t = Math.sqrt(v / max);
    return `rgba(45, 212, 191, ${(0.18 + 0.72 * t).toFixed(3)})`;
  };

  if (!mounted) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="flex items-center justify-center rounded-2xl border border-line bg-panel text-sm text-muted" style={{ minHeight: 460 }}>
          Loading map…
        </div>
        <div className="rounded-2xl border border-line bg-panel" style={{ minHeight: 460 }} />
      </div>
    );
  }

  const seg = (m: Metric, label: string) => (
    <button
      type="button"
      onClick={() => setMetric(m)}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        metric === m ? "bg-accent font-semibold text-white" : "font-medium text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg border border-line bg-panel-2 p-1">
          {seg("all", "All")}
          {seg("users", `Accounts (${totals.users})`)}
          {seg("visitors", `Visitors (${totals.visitors})`)}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showCities} onChange={(e) => setShowCities(e.target.checked)} />
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} /> Cities
          </label>
          <span className="flex items-center gap-2">
            <span>Fewer</span>
            <span className="h-3 w-20 rounded" style={{ background: "linear-gradient(90deg, #141c2e, rgba(45,212,191,1))" }} />
            <span>More</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of user and visitor locations">
            <g>
              {FEATURES.map((f, i) => {
                if (!f.d) return null;
                const alpha2 = NUMERIC_TO_ALPHA2[f.id];
                const c = alpha2 ? byAlpha2.get(alpha2) : undefined;
                return (
                  <path key={i} d={f.d} fill={fillFor(alpha2)} stroke="#243049" strokeWidth={0.5} className="transition-[fill] hover:stroke-accent">
                    <title>
                      {f.name}
                      {c ? ` — ${c.users} account${c.users === 1 ? "" : "s"}, ${c.visitors} visitor${c.visitors === 1 ? "" : "s"}` : " — none"}
                    </title>
                  </path>
                );
              })}
            </g>
            {showCities && (
              <g>
                {points.map((p, i) => {
                  const v = valueFor(p, metric);
                  if (v <= 0) return null;
                  const xy = projection([p.lon, p.lat]);
                  if (!xy) return null;
                  const r = 2.5 + 5.5 * Math.sqrt(v / pointMax);
                  const label = [p.city, countryName(p.country)].filter(Boolean).join(", ") || "Unknown";
                  return (
                    <circle key={i} cx={xy[0]} cy={xy[1]} r={r} fill="rgba(245,158,11,0.85)" stroke="#1a1205" strokeWidth={0.6}>
                      <title>{`${label} — ${p.users} account${p.users === 1 ? "" : "s"}, ${p.visitors} visitor${p.visitors === 1 ? "" : "s"}`}</title>
                    </circle>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Top locations
          </div>
          <ul className="max-h-[430px] divide-y divide-line/60 overflow-y-auto">
            {ranked.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No location data yet.</li>}
            {ranked.map((c) => (
              <li key={c.country} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <CountryFlag code={c.country} showName />
                </span>
                <span className="shrink-0 tabular-nums text-ink" title={`${c.users} accounts · ${c.visitors} visitors`}>
                  {c.v}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Countries are shaded by count ({metric === "all" ? "accounts + visitors" : metric}); amber dots are cities (one
        per city, sized by count). Hover for a breakdown. Locations come from IP geolocation — click any flag for the
        basis.
      </p>
    </>
  );
}
