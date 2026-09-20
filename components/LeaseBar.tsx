"use client";

import { useState } from "react";
import ShareControl from "./ShareControl";
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
 *
 * `readOnly` is for the decoder, where the lease is settled: you got there by
 * opening a quote on a particular lease, so renaming it or switching to
 * another mid-transcription is a way to lose your place, not a feature. It
 * shows which lease you are on and nothing else.
 *
 * Sharing a whole lease is a wider thing than sharing a quote, and the
 * difference is the point rather than a detail. A quote link carries a
 * provider's document and the arithmetic on it; the salary is stripped before
 * the page is serialised. A lease link carries the lease — which means the
 * salary, whether there is a study loan, the employer's FBT status, and how
 * much of an FBT cap has already gone on rent or a mortgage. Notes and the
 * statement ledger are left out by the query that serves it, but what remains
 * is still somebody's finances.
 *
 * So the control says which of the two this is, before the link is sent
 * rather than after. Signed in only, and not by policy: a guest's lease never
 * reaches the server, so there is nothing for a link to point at.
 */
export default function LeaseBar({
  store,
  signedIn,
  readOnly = false,
}: {
  store: UseLease;
  signedIn: boolean;
  /** Show which lease this is, without the means to change or leave it. */
  readOnly?: boolean;
}) {
  const { all, leaseId, lease, saving } = store;
  const [notice, setNotice] = useState<string | null>(null);

  const status = (
    <span className="ml-auto text-xs text-muted">
      {saving ? "Saving…" : signedIn ? "Saved to your account" : "Saved in this browser"}
    </span>
  );

  if (readOnly) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Lease</span>
        <span className="text-sm font-medium text-ink">{lease.name}</span>
        {status}
      </div>
    );
  }

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

      {signedIn && leaseId && (
        <ShareControl
          id={leaseId}
          initialToken={null}
          onNotice={setNotice}
          shareLabel="Share lease"
          copyLabel="Copy lease link"
          copiedNotice="Link copied. Anyone with it can read this whole lease — the car, every quote, and the figures behind them, which includes your salary. Your notes and your statement ledger are not in it. Use “unshare” to switch the link off."
        />
      )}

      {status}

      {notice && (
        <p
          role="status"
          className="w-full rounded-md border border-accent-border bg-accent-subtle px-2.5 py-1.5 text-xs leading-snug text-ink"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
