"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyVisitors } from "@/lib/adminVisitors";

const LOOKED = "#64748b"; // slate — "just looked around"
const ENGAGED = "#34d399"; // emerald — hit a funnel milestone
const BOTS = "#b45309"; // amber-700 — likely bots (filtered from the human counts)

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyVisitors }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const date = new Date(`${d.day}T00:00:00`);
  const label = date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const rate = d.uniques ? Math.round((d.engaged / d.uniques) * 100) : 0;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      <div className="flex items-center gap-1.5 tabular-nums text-success-text">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ENGAGED }} />
        {d.engaged} engaged
      </div>
      <div className="flex items-center gap-1.5 tabular-nums text-muted">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: LOOKED }} />
        {d.looked} looked around
      </div>
      {d.bots > 0 && (
        <div className="flex items-center gap-1.5 tabular-nums text-warning-text">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: BOTS }} />
          {d.bots} bot{d.bots === 1 ? "" : "s"}
        </div>
      )}
      <div className="mt-1 border-t border-line pt-1 tabular-nums text-ink">
        {d.uniques} human{d.uniques === 1 ? "" : "s"}{d.uniques ? ` · ${rate}% engaged` : ""}
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Stacked bar chart of distinct human visitors active each day, split into those who
 *  engaged (hit a funnel milestone) vs those who just looked around. Top of the
 *  Anonymous visitors admin view. */
export default function VisitorsDailyChart({ data }: { data: DailyVisitors[] }) {
  const total = data.reduce((s, d) => s + d.uniques, 0);
  const engaged = data.reduce((s, d) => s + d.engaged, 0);
  const bots = data.reduce((s, d) => s + d.bots, 0);
  const peak = data.reduce((m, d) => Math.max(m, d.uniques + d.bots), 0);
  const rate = total ? Math.round((engaged / total) * 100) : 0;
  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Unique visitors per day</h2>
        <span className="text-xs text-muted">
          last {data.length} days · peak {peak}/day · {rate}% engaged
          {bots > 0 ? ` · ${bots} bot${bots === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={24}
            tickLine={false}
            axisLine={{ stroke: "#ffffff12" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            width={32}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "#ffffff08" }} content={<DayTooltip />} />
          {/* Stacked bottom→top: looked-around, engaged, then bots (rounded cap). */}
          <Bar dataKey="looked" stackId="v" fill={LOOKED} maxBarSize={26} />
          <Bar dataKey="engaged" stackId="v" fill={ENGAGED} radius={[2, 2, 0, 0]} maxBarSize={26} />
          <Bar dataKey="bots" stackId="v" fill={BOTS} fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
        <Swatch color={ENGAGED} label="Engaged (hit a milestone)" />
        <Swatch color={LOOKED} label="Just looked around" />
        <Swatch color={BOTS} label="Likely bots" />
      </div>
    </div>
  );
}
