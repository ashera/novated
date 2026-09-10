"use client";

import { useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";
import { getVisitorEvents, type VisitorEvent } from "@/app/actions/visitorDetail";
import { describeVisitorEvent } from "@/lib/visitorEventLabels";
import type { AdminVisitorRow } from "@/lib/adminVisitors";

function prettyPath(path: string | null): string {
  if (!path) return "—";
  const map: Record<string, string> = {
    "/": "Calculator",
    "/how-it-works": "How it works",
    "/report": "Lease report",
    "/faq": "FAQ",
    "/about": "About",
  };
  return map[path] ?? path;
}

function timeOf(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function propsSummary(props: Record<string, unknown> | null): string {
  if (!props || typeof props !== "object") return "";
  const parts = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join(" · ");
}


export default function VisitorDetailModal({
  visitor,
  onClose,
}: {
  visitor: AdminVisitorRow;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<VisitorEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getVisitorEvents(visitor.id).then((r) => {
      if (!live) return;
      if (r.ok) setEvents(r.events ?? []);
      else setError(r.error ?? "Couldn't load activity.");
    });
    return () => {
      live = false;
    };
  }, [visitor.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => {
    if (!events || events.length === 0) return null;
    const pageviews = events.filter((e) => e.event === "pageview");
    const first = new Date(events[0].created_at).getTime();
    const last = new Date(events[events.length - 1].created_at).getTime();
    const mins = Math.max(0, Math.round((last - first) / 60000));
    const secs = Math.max(0, Math.round((last - first) / 1000));
    return {
      total: events.length,
      pageviews: pageviews.length,
      entry: prettyPath(pageviews[0]?.path ?? events[0].path),
      exit: prettyPath(pageviews[pageviews.length - 1]?.path ?? events[events.length - 1].path),
      duration: mins >= 1 ? `${mins} min` : `${secs}s`,
    };
  }, [events]);

  const place = [visitor.city, visitor.region].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#091e42]/54 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <CountryFlag code={visitor.country} showName />
              {visitor.is_bot && (
                <span className="rounded-full bg-warning-subtle px-1.5 py-0.5 text-[11px] font-semibold text-warning-text">🤖 bot</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {place && `${place} · `}
              {visitor.ip}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-4 gap-2 border-b border-line px-5 py-3 text-center">
            {[
              ["Events", String(summary.total)],
              ["Pages", String(summary.pageviews)],
              ["On site", summary.duration],
              ["Signed up", visitor.converted_email ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-sm font-semibold text-ink">{v}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
              </div>
            ))}
            <div className="col-span-4 mt-1 text-xs text-muted">
              Entered on <span className="text-ink">{summary.entry}</span>, last on{" "}
              <span className="text-ink">{summary.exit}</span>
              {visitor.converted_email && (
                <>
                  {" "}
                  · signed up as <span className="text-accent">{visitor.converted_email}</span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-danger-text">{error}</p>}
          {!error && events === null && <p className="text-sm text-muted">Loading activity…</p>}
          {!error && events?.length === 0 && (
            <p className="text-sm text-muted">
              No detailed activity recorded for this visitor (they were seen but did nothing tracked, or predate
              activity logging).
            </p>
          )}
          {events && events.length > 0 && (
            <ol className="relative space-y-3 border-l border-line pl-4">
              {events.map((e, i) => {
                const isPage = e.event === "pageview";
                const desc = isPage
                  ? { label: `Viewed ${prettyPath(e.path)}`, keepProps: false }
                  : describeVisitorEvent(e.event, e.props);
                const ps = desc.keepProps ? propsSummary(e.props) : "";
                return (
                  <li key={i} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${isPage ? "bg-accent" : "bg-accent"}`}
                    />
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink">{desc.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{timeOf(e.created_at)}</span>
                    </div>
                    {ps && <div className="text-xs text-muted">{ps}</div>}
                    {!isPage && e.path && <div className="text-[11px] text-muted/70">on {prettyPath(e.path)}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
