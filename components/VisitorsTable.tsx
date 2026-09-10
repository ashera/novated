"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime, fmtCompact } from "@/lib/au/format";
import FlagWithBasis from "@/components/FlagWithBasis";
import VisitorDetailModal from "@/components/VisitorDetailModal";
import type { AdminVisitorRow } from "@/lib/adminVisitors";

/** City/region (the country is shown as the flag alongside). */
function placeOf(v: AdminVisitorRow): string {
  const parts = [v.city, v.region].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

/** A short, readable device string from the user-agent (best-effort). */
function deviceOf(ua: string | null): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Macintosh/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os].filter(Boolean).join(" · ") || "Other";
}

function Badge({ label, tone }: { label: string; tone: "vehicle" | "salary" | "compare" | "report" }) {
  const cls = {
    vehicle: "bg-success-subtle text-success-text",
    salary: "bg-accent-subtle text-accent",
    compare: "bg-discovery-subtle text-discovery-text",
    report: "bg-warning-subtle text-warning-text",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export default function VisitorsTable({ visitors }: { visitors: AdminVisitorRow[] }) {
  const [q, setQ] = useState("");
  const [engagedOnly, setEngagedOnly] = useState(false);
  const [hideBots, setHideBots] = useState(true);
  const [selected, setSelected] = useState<AdminVisitorRow | null>(null);
  const query = q.trim().toLowerCase();
  const botCount = useMemo(() => visitors.filter((v) => v.is_bot).length, [visitors]);

  const filtered = useMemo(() => {
    return visitors.filter((v) => {
      if (hideBots && v.is_bot) return false;
      if (engagedOnly && !(v.priced_vehicle || v.set_salary || v.visited_compare || v.visited_report)) {
        return false;
      }
      if (!query) return true;
      const hay = [v.city, v.region, v.country, v.ip, v.locale, v.user_agent, v.converted_email, v.bot_reason]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [visitors, query, engagedOnly, hideBots]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search location / IP / device…"
          className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={engagedOnly} onChange={(e) => setEngagedOnly(e.target.checked)} />
          Engaged only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={hideBots} onChange={(e) => setHideBots(e.target.checked)} />
          Hide bots{botCount > 0 && ` (${botCount})`}
        </label>
        <span className="text-xs text-muted">
          {filtered.length}
          {filtered.length !== visitors.length && ` of ${visitors.length}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3 text-right">Visits</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Milestones</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">First seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr
                key={v.id}
                onClick={(e) => {
                  // Ignore clicks that land on an interactive child (flag popover, email link).
                  if ((e.target as HTMLElement).closest("button, a")) return;
                  setSelected(v);
                }}
                title="Click for this visitor's activity"
                className="cursor-pointer border-b border-line/60 align-top transition hover:bg-panel-2/40"
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDateTime(v.last_seen_at)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{v.visits}</td>
                <td className="px-4 py-2.5 text-ink">
                  <FlagWithBasis kind="visitor" id={v.id} code={v.country} showName />
                  {placeOf(v) && <div className="text-xs text-muted">{placeOf(v)}</div>}
                  {v.ip && <div className="text-xs text-muted/70">{v.ip}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {v.priced_vehicle && (
                      <Badge tone="vehicle" label={`Car ${v.vehicle_price != null ? fmtCompact(v.vehicle_price) : "✓"}`} />
                    )}
                    {v.set_salary && (
                      <Badge tone="salary" label={`Salary ${v.salary != null ? fmtCompact(v.salary) : "✓"}`} />
                    )}
                    {v.visited_compare && <Badge tone="compare" label="Compared" />}
                    {v.visited_report && <Badge tone="report" label="Report" />}
                    {!v.priced_vehicle && !v.set_salary && !v.visited_compare && !v.visited_report && (
                      <span className="text-xs text-muted">Looked around</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {v.converted_email ? (
                    <Link
                      href={`/admin/users/${v.converted_user_id}`}
                      className="text-xs font-medium text-accent hover:underline"
                      title={`Signed up as ${v.converted_email}`}
                    >
                      {v.converted_email}
                    </Link>
                  ) : v.signed_up ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent" title="Converted (account since deleted)">
                      Converted
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted" title={v.user_agent ?? undefined}>
                  <span className="flex items-center gap-1.5">
                    {deviceOf(v.user_agent)}
                    {v.is_bot && (
                      <span
                        className="rounded-full bg-warning-subtle px-1.5 py-0.5 text-[11px] font-semibold text-warning-text"
                        title={v.bot_reason ? `Likely bot — ${v.bot_reason}` : "Likely bot"}
                      >
                        🤖 bot
                      </span>
                    )}
                  </span>
                  {v.locale && <div className="text-xs text-muted/70">{v.locale}</div>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDate(v.first_seen_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  {visitors.length === 0 ? "No anonymous visitors recorded yet." : "No visitors match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <VisitorDetailModal visitor={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
