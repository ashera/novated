"use client";

import Link from "next/link";
import type { UseLease } from "./useLease";

/**
 * Which lease am I looking at?
 *
 * Shown on both tools, because the whole point of the lease entity is that
 * they share one. Switching here changes what the calculator AND the decoder
 * are working on.
 */
export default function LeaseSwitcher({
  store,
  signedIn,
}: {
  store: UseLease;
  signedIn: boolean;
}) {
  const { all, leaseId, lease, saving } = store;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Lease</span>

      <input
        value={lease.name}
        onChange={(e) => store.update((l) => ({ ...l, name: e.target.value }))}
        aria-label="Lease name"
        className="min-w-[10rem] max-w-xs flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-sm font-medium text-ink outline-none focus:border-accent"
      />

      {all.length > 1 && (
        <select
          value={leaseId ?? ""}
          onChange={(e) => store.switchTo(e.target.value)}
          aria-label="Switch lease"
          className="rounded-md border border-line bg-panel-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent"
        >
          {all.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={store.create}
        className="rounded-md border border-dashed border-line-bold px-2.5 py-1 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
      >
        + New lease
      </button>

      {leaseId && all.length > 1 && (
        <button
          type="button"
          onClick={() => store.remove(leaseId)}
          className="rounded px-2 py-1 text-sm text-muted transition hover:bg-danger-subtle hover:text-danger-text"
        >
          Delete
        </button>
      )}

      <span className="ml-auto flex items-center gap-3 text-xs text-muted">
        {lease.quotes.length > 0 && (
          <Link href="/compare" className="font-medium text-accent hover:underline">
            {lease.quotes.length} quote{lease.quotes.length === 1 ? "" : "s"}
          </Link>
        )}
        <span>
          {saving ? "Saving…" : signedIn ? "Saved to your account" : "Saved in this browser"}
        </span>
      </span>
    </div>
  );
}
