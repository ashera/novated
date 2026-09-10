"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/au/format";
import { adminDeletePlan, adminShareLink } from "@/app/actions/admin";

interface PlanRow {
  id: string;
  name: string;
  updated_at: string;
}

/** Admin: list a user's saved scenarios, open any one in a READ-ONLY preview (for
 *  support / inspection) — a sandbox that never touches the admin's own plan — or
 *  delete it. */
export default function UserPlansList({ plans, email }: { plans: PlanRow[]; email?: string }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const share = async (id: string) => {
    setError(null);
    setShareUrl(null);
    setSharingId(id);
    const r = await adminShareLink(id);
    setSharingId(null);
    if (!r.ok || !r.token) {
      setError(r.error ?? "Couldn't create a share link.");
      return;
    }
    const url = `${window.location.origin}/api/s/${r.token}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked — the URL is shown below to copy manually */
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This permanently removes this saved scenario${email ? ` from ${email}` : ""}.`)) return;
    setError(null);
    setDeletingId(id);
    const r = await adminDeletePlan(id);
    if (!r.ok) {
      setError(r.error ?? "Couldn't delete that scenario.");
      setDeletingId(null);
      return;
    }
    router.refresh(); // re-fetch the detail page so the list + count update
    setDeletingId(null);
  };

  if (plans.length === 0) return <p className="text-sm text-muted">No saved scenarios.</p>;

  const busy = deletingId != null || sharingId != null;

  return (
    <>
      {error && <p className="mb-2 text-sm text-danger-text">{error}</p>}
      {shareUrl && (
        <div className="mb-2 rounded-lg border border-accent/40 bg-accent/[0.06] px-3 py-2 text-xs">
          <p className="font-medium text-accent">Scenario link copied — send it to Claude:</p>
          <code className="mt-1 block break-all text-ink">{shareUrl}</code>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <span className="font-medium text-ink">{p.name}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted">updated {fmtDate(p.updated_at)}</span>
              <button
                onClick={() => share(p.id)}
                disabled={busy}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent disabled:opacity-40"
              >
                {sharingId === p.id ? "Linking…" : "🔗 Link for Claude"}
              </button>
              <Link
                href={`/admin/scenario/${p.id}`}
                target="_blank"
                title="Open a read-only preview — a sandbox that never touches your own plan"
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent"
              >
                View scenario →
              </Link>
              <button
                onClick={() => remove(p.id, p.name)}
                disabled={busy}
                aria-label={`Delete ${p.name}`}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-danger/40 hover:text-danger-text disabled:opacity-40"
              >
                {deletingId === p.id ? "Deleting…" : "✕ Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
