"use client";

import { useMemo, useState, useTransition } from "react";
import { fmtDateTime } from "@/lib/au/format";
import type { FeedbackRow } from "@/lib/adminFeedback";
import { setFeedbackHandled, deleteFeedback } from "@/app/actions/feedback";

const SENTIMENT: Record<string, { emoji: string; label: string; cls: string }> = {
  love: { emoji: "😍", label: "Love it", cls: "bg-success-subtle text-success-text" },
  ok: { emoji: "🙂", label: "It's OK", cls: "bg-accent-subtle text-accent" },
  frustrated: { emoji: "😕", label: "Frustrating", cls: "bg-warning-subtle text-warning-text" },
};

type Filter = "all" | "new" | "handled";

export default function FeedbackTable({ items }: { items: FeedbackRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    return items.filter((f) => {
      if (filter === "new" && f.handled) return false;
      if (filter === "handled" && !f.handled) return false;
      if (query) {
        const hay = `${f.message} ${f.user_email ?? ""} ${f.email ?? ""} ${f.path ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  const newCount = items.filter((f) => !f.handled).length;

  const TABS: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${items.length})` },
    { key: "new", label: `New (${newCount})` },
    { key: "handled", label: `Handled (${items.length - newCount})` },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 transition ${
                filter === t.key ? "bg-accent font-semibold text-white" : "font-medium text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search feedback…"
          className="w-full max-w-xs rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((f) => {
          const s = f.sentiment ? SENTIMENT[f.sentiment] : null;
          const who = f.user_email ?? f.email ?? "Anonymous";
          return (
            <div
              key={f.id}
              className={`rounded-2xl border bg-panel p-4 transition ${
                f.handled ? "border-line/60 opacity-70" : "border-line"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {s && (
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${s.cls}`}>
                    {s.emoji} {s.label}
                  </span>
                )}
                <span className="font-medium text-ink">{who}</span>
                {f.user_email && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">account</span>}
                {f.email && !f.user_email && <span className="rounded bg-panel-2 px-1.5 py-0.5">guest · reply-to</span>}
                <span>·</span>
                <span>{fmtDateTime(f.created_at)}</span>
                {f.path && <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">{f.path}</span>}
                {f.handled && <span className="ml-auto text-success-text">✓ Handled</span>}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{f.message}</p>

              <div className="mt-3 flex items-center gap-4 text-xs">
                <button
                  disabled={pending}
                  onClick={() => start(() => void setFeedbackHandled(f.id, !f.handled))}
                  className="font-medium text-ink transition hover:text-accent disabled:opacity-50"
                >
                  {f.handled ? "Reopen" : "Mark handled"}
                </button>
                {f.email && (
                  <a href={`mailto:${f.email}`} className="font-medium text-ink transition hover:text-accent">
                    Reply by email
                  </a>
                )}
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Delete this feedback permanently?")) start(() => void deleteFeedback(f.id));
                  }}
                  className="ml-auto font-medium text-danger-text transition hover:text-danger-text disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-line bg-panel px-4 py-12 text-center text-muted">
            {items.length === 0 ? "No feedback yet." : "Nothing matches this filter."}
          </div>
        )}
      </div>
    </>
  );
}
