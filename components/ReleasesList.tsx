"use client";

import { useMemo, useState } from "react";
import type { Release } from "@/lib/releases";

const PAGE_SIZE = 8;

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/** Public changelog list with a plain-text search and simple pagination. The full
 *  set of published releases is passed in and filtered/paged on the client. */
export default function ReleasesList({ releases }: { releases: Release[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return releases;
    return releases.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        r.version.toLowerCase().includes(q) ||
        (r.commit_hash ?? "").toLowerCase().includes(q) ||
        r.notes.some((n) => n.toLowerCase().includes(q)),
    );
  }, [releases, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <div>
      <div className="mb-5">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search updates…"
          aria-label="Search release notes"
          className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        {q && (
          <p className="mt-1.5 text-xs text-muted">
            {filtered.length} {filtered.length === 1 ? "result" : "results"} for “{query}”.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-6 text-muted">
          {q ? "No updates match your search." : "No releases published yet — check back soon."}
        </p>
      ) : (
        <ol className="space-y-4">
          {shown.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-ink">{fmtDate(r.released_at)}</span>
                  {r.title && <span className="text-sm text-ink">— {r.title}</span>}
                </div>
                <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted">
                  <span className="rounded-full bg-panel-2 px-2 py-0.5">
                    v{r.version}
                    {r.build != null ? ` · build ${r.build}` : ""}
                  </span>
                  {r.commit_hash && <span className="font-mono">{r.commit_hash.slice(0, 7)}</span>}
                </span>
              </div>
              {r.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {r.notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage(cur - 1)}
            disabled={cur <= 1}
            className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 font-medium text-ink transition hover:border-accent/50 hover:text-ink disabled:opacity-40"
          >
            ← Newer
          </button>
          <span className="text-muted">
            Page {cur} of {pages}
          </span>
          <button
            onClick={() => setPage(cur + 1)}
            disabled={cur >= pages}
            className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 font-medium text-ink transition hover:border-accent/50 hover:text-ink disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}
