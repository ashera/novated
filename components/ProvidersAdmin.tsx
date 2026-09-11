"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminTabs from "./AdminTabs";
import { fmtDate } from "@/lib/au/format";
import { providerSlug, type ProviderStatus } from "@/lib/au/providers";
import {
  addProvider,
  deleteProvider,
  mergeProvider,
  setProviderStatus,
  updateProvider,
  type ProviderRow,
} from "@/app/actions/providers";

/**
 * Moderating the provider directory.
 *
 * The queue is the point, so pending sits at the top and the page opens on
 * it. Everything else is the maintenance that follows: fixing a name someone
 * typed in a hurry, and folding the duplicate that the slug did not catch —
 * "Smart Leasing" and "Smartleasing" are two different keys but one company,
 * and only a person can tell.
 */

const STATUS_STYLE: Record<ProviderStatus, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-success-subtle text-success-text" },
  pending: { label: "Pending", className: "bg-warning-subtle text-warning-text" },
  rejected: { label: "Rejected", className: "bg-panel-3 text-muted" },
};

type Filter = "pending" | "approved" | "rejected" | "all";

const input =
  "w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";

export default function ProvidersAdmin({ providers }: { providers: ProviderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(
    providers.some((p) => p.status === "pending") ? "pending" : "all",
  );
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [merging, setMerging] = useState<ProviderRow | null>(null);
  const [fresh, setFresh] = useState("");

  const counts = useMemo(
    () => ({
      pending: providers.filter((p) => p.status === "pending").length,
      approved: providers.filter((p) => p.status === "approved").length,
      rejected: providers.filter((p) => p.status === "rejected").length,
    }),
    [providers],
  );

  const rows = useMemo(() => {
    const needle = providerSlug(q);
    return providers.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (needle && !p.slug.includes(needle) && !providerSlug(p.name).includes(needle)) return false;
      return true;
    });
  }, [providers, q, filter]);

  const run = async (
    id: string,
    fn: () => Promise<{ ok?: boolean; error?: string }>,
    done?: string,
  ) => {
    setError(null);
    setNote(null);
    setBusy(id);
    try {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return false;
      }
      if (done) setNote(done);
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-1 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Your leases
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-ink">Providers</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The companies suggested in the decoder&apos;s &ldquo;who quoted it&rdquo; box. Anyone can
        propose one; nothing reaches the suggestions until it is approved here. A quote keeps
        whatever name its owner typed either way — moderating this list never changes anyone&apos;s
        saved work.
      </p>

      <div className="mt-6">
        <AdminTabs active="providers" providerQueue={counts.pending} />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger-subtle px-4 py-2.5 text-sm text-danger-text">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="mb-4 rounded-lg border border-success/40 bg-success-subtle px-4 py-2.5 text-sm text-success-text">
          {note}
        </p>
      )}

      {/* ── Add one directly ─────────────────────────────────────────────── */}
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("new", () => addProvider(fresh), `Added ${fresh.trim()}.`)) setFresh("");
        }}
      >
        <input
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          placeholder="Add a provider — approved straight away"
          aria-label="Add a provider"
          className="min-w-[16rem] flex-1 rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!fresh.trim() || busy === "new"}
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the directory"
          aria-label="Search providers"
          className="min-w-[14rem] flex-1 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
        />
        {(
          [
            ["pending", `Pending (${counts.pending})`],
            ["approved", `Approved (${counts.approved})`],
            ["rejected", `Rejected (${counts.rejected})`],
            ["all", `All (${providers.length})`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              filter === key
                ? "border-accent bg-accent-subtle text-accent"
                : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Provider</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Times named</th>
              <th className="px-3 py-2 font-semibold">Suggested</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="text-left font-medium text-accent hover:underline"
                  >
                    {p.name}
                  </button>
                  <p className="text-[11px] text-muted">{p.slug}</p>
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-[11px] text-muted hover:text-ink"
                    >
                      {p.website}
                    </a>
                  )}
                  {p.notes && <p className="mt-0.5 max-w-md text-[11px] text-subtle">{p.notes}</p>}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[p.status].className}`}
                  >
                    {STATUS_STYLE[p.status].label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-subtle">
                  {p.suggested_count}
                </td>
                <td className="px-3 py-2 text-[11px] text-muted">
                  {fmtDate(p.created_at)}
                  {p.suggested_by && <div className="text-subtle">{p.suggested_by}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {p.status !== "approved" && (
                      <button
                        type="button"
                        disabled={busy === p.id}
                        onClick={() => void run(p.id, () => setProviderStatus(p.id, "approved"), `${p.name} approved.`)}
                        className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-accent-soft"
                      >
                        Approve
                      </button>
                    )}
                    {p.status !== "rejected" && (
                      <button
                        type="button"
                        disabled={busy === p.id}
                        onClick={() => void run(p.id, () => setProviderStatus(p.id, "rejected"), `${p.name} rejected.`)}
                        className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMerging(p)}
                      className="rounded border border-line bg-panel-2 px-2 py-1 text-xs font-medium text-ink transition hover:bg-panel-3"
                    >
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded border border-line bg-panel-2 px-2 py-1 text-xs font-medium text-ink transition hover:bg-panel-3"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted">
                  {filter === "pending" ? "Nothing waiting. " : "Nothing matches that. "}
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setQ("");
                    }}
                    className="font-medium text-accent hover:underline"
                  >
                    Show the whole directory
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Editor
          row={editing}
          busy={busy !== null}
          error={error}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={async (v) => {
            if (await run(editing.id, () => updateProvider(editing.id, v), "Saved.")) {
              setEditing(null);
            }
          }}
          onDelete={async () => {
            if (!confirm(`Delete ${editing.name} from the directory for good?`)) return;
            if (await run(editing.id, () => deleteProvider(editing.id), "Deleted.")) {
              setEditing(null);
            }
          }}
        />
      )}

      {merging && (
        <Merger
          row={merging}
          others={providers.filter((p) => p.id !== merging.id)}
          busy={busy !== null}
          error={error}
          onClose={() => {
            setMerging(null);
            setError(null);
          }}
          onMerge={async (intoId) => {
            const into = providers.find((p) => p.id === intoId);
            if (await run(merging.id, () => mergeProvider(merging.id, intoId), `Folded ${merging.name} into ${into?.name}.`)) {
              setMerging(null);
            }
          }}
        />
      )}
    </div>
  );
}

function Shell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#091e42]/54 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-12 w-full max-w-lg rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

function Editor({
  row,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  row: ProviderRow;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (v: { name: string; website: string; notes: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [website, setWebsite] = useState(row.website ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <Shell
      title={row.name}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => onSave({ name, website, notes })}
            disabled={busy}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
          >
            Save
          </button>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
          >
            Delete
          </button>
        </>
      }
    >
      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-ink">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} />
        <span className="mt-1 block text-[11px] text-muted">
          Matching key: <code className="text-subtle">{providerSlug(name) || "—"}</code>. Renaming
          re-keys it, which is how a misspelling stops being its own company.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Website</span>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className={`mt-1 ${input}`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Notes</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal only — never shown to users"
          className={`mt-1 ${input}`}
        />
      </label>
      <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] text-muted">
        Named on {row.suggested_count} quote{row.suggested_count === 1 ? "" : "s"}. Last touched{" "}
        {fmtDate(row.updated_at)}.
      </p>
    </Shell>
  );
}

function Merger({
  row,
  others,
  busy,
  error,
  onClose,
  onMerge,
}: {
  row: ProviderRow;
  others: ProviderRow[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: (intoId: string) => void;
}) {
  const [into, setInto] = useState("");

  return (
    <Shell
      title={`Fold ${row.name} into…`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => onMerge(into)}
            disabled={!into || busy}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
          >
            Merge
          </button>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-ink">
            Cancel
          </button>
        </>
      }
    >
      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <p className="text-sm text-subtle">
        For the duplicates the matching key cannot catch — &ldquo;Smart Leasing&rdquo; and
        &ldquo;Smartleasing&rdquo; are two keys but one company.
      </p>
      <label className="block">
        <span className="text-sm font-medium text-ink">Keep</span>
        <select value={into} onChange={(e) => setInto(e.target.value)} className={`mt-1 ${input}`}>
          <option value="">Choose the one to keep…</option>
          {[...others]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.status !== "approved" ? ` (${o.status})` : ""}
              </option>
            ))}
        </select>
      </label>
      <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] text-muted">
        {row.name} is deleted and its {row.suggested_count} mention
        {row.suggested_count === 1 ? "" : "s"} move across. Quotes keep the name their owner typed
        — nothing in anyone&apos;s saved work changes.
      </p>
    </Shell>
  );
}
