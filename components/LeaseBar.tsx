"use client";

import type { UseLease } from "./useLease";

/**
 * Which lease you're working on — its name, the switcher, and whether it has
 * saved.
 *
 * Rendered as the header strip of the vehicle card rather than as a card of
 * its own. The lease is not a thing you think about; the car is. Giving the
 * lease equal billing above the hero made the page open on a text field
 * labelled "Lease" instead of on the car, which is the opposite of the point.
 * As a strip it stays available — you can rename, switch or start another —
 * without competing for the first look.
 */
export default function LeaseBar({
  store,
  signedIn,
}: {
  store: UseLease;
  signedIn: boolean;
}) {
  const { all, leaseId, lease, saving } = store;

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      <span className="ml-auto text-xs text-muted">
        {saving ? "Saving…" : signedIn ? "Saved to your account" : "Saved in this browser"}
      </span>
    </div>
  );
}
