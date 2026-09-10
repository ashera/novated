"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  markSourceUpdated,
  updateSource,
  type SourceForm,
} from "@/app/actions/sources";
import AdminTabs from "@/components/AdminTabs";
import type { Unit } from "@/lib/au/params";
import type { Staleness } from "@/lib/au/staleness";

interface ProvidedParam {
  key: string;
  label: string;
  category: string;
  unit: Unit;
  value: number;
  lastVerifiedAt: string | null;
  needsVerification: boolean;
}
interface SourceView {
  id: string;
  key: string;
  name: string;
  organisation: string | null;
  url: string | null;
  description: string | null;
  update_frequency: string | null;
  review_interval_days: number | null;
  last_updated_from: string | null;
  notes: string | null;
  params: ProvidedParam[];
  verified: number;
  needsCheck: number;
  staleness: Staleness;
}

function fmtVal(unit: Unit, value: number): string {
  if (unit === "percent") return `${+(value * 100).toFixed(3)}%`;
  if (unit === "aud")
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(value);
  return String(+value.toFixed(4));
}
function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StaleBadge({ s }: { s: Staleness }) {
  if (s.state === "none")
    return (
      <span className="rounded-full bg-line-bold/15 px-2 py-0.5 text-xs font-medium text-muted">
        No schedule
      </span>
    );
  if (s.state === "stale")
    return (
      <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
        {s.neverRefreshed
          ? "Never refreshed"
          : `Stale · ${s.overdueDays}d overdue`}
      </span>
    );
  if (s.state === "due")
    return (
      <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-text">
        Due soon · {Math.abs(s.overdueDays ?? 0)}d
      </span>
    );
  return (
    <span className="rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">
      Fresh
    </span>
  );
}

function reviewLine(s: SourceView): string {
  const st = s.staleness;
  if (st.state === "none") return "No review schedule set.";
  const every = `reviewed every ${st.intervalDays} days`;
  if (st.neverRefreshed) return `Never refreshed from source · ${every}.`;
  if (st.overdueDays != null && st.overdueDays > 0)
    return `${st.overdueDays} days overdue · ${every}.`;
  const dueIn = st.overdueDays != null ? -st.overdueDays : null;
  return `Due in ${dueIn} days · ${every}.`;
}

function SourceCard({ source }: { source: SourceView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<SourceForm>({
    name: source.name,
    organisation: source.organisation ?? "",
    url: source.url ?? "",
    update_frequency: source.update_frequency ?? "",
    review_interval_days: source.review_interval_days,
    description: source.description ?? "",
    notes: source.notes ?? "",
  });

  const set = (k: keyof SourceForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () =>
    startTransition(async () => {
      const res = await updateSource(source.key, form);
      if (res.error) setNotice(res.error);
      else {
        setNotice("Saved.");
        setEditing(false);
        router.refresh();
      }
    });

  const markUpdated = () =>
    startTransition(async () => {
      const res = await markSourceUpdated(source.key);
      if (res.error) setNotice(res.error);
      else {
        setNotice("Marked as refreshed from source today.");
        router.refresh();
      }
    });

  const borderClass =
    source.staleness.state === "stale"
      ? "border-danger/40"
      : source.staleness.state === "due"
        ? "border-warning/40"
        : "border-line";

  return (
    <div className={`rounded-2xl border ${borderClass} bg-panel p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">{source.name}</h2>
            <StaleBadge s={source.staleness} />
          </div>
          <div className="mt-0.5 text-sm text-muted">{source.organisation}</div>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block break-all text-xs text-accent hover:underline"
            >
              {source.url} ↗
            </a>
          )}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/50"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* Meta chips */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">
            Cadence
          </span>
          <div className="text-ink">{source.update_frequency ?? "—"}</div>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">
            Last updated from source
          </span>
          <div className="text-ink">{fmtDate(source.last_updated_from)}</div>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">
            Provides
          </span>
          <div className="text-ink">
            {source.params.length} params · {source.verified} verified
            {source.needsCheck > 0 && (
              <span className="text-warning-text"> · {source.needsCheck} to check</span>
            )}
          </div>
        </div>
        <button
          onClick={markUpdated}
          disabled={pending}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
        >
          Mark refreshed today
        </button>
      </div>

      <p
        className={`mt-2 text-xs ${
          source.staleness.state === "stale"
            ? "text-danger-text"
            : source.staleness.state === "due"
              ? "text-warning-text"
              : "text-muted"
        }`}
      >
        {reviewLine(source)}
      </p>

      {source.description && !editing && (
        <p className="mt-3 text-sm text-ink">{source.description}</p>
      )}
      {source.notes && !editing && (
        <p className="mt-1 text-xs text-muted">Note: {source.notes}</p>
      )}

      {notice && <p className="mt-3 text-xs text-accent">{notice}</p>}

      {/* Edit form */}
      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-line bg-panel-2 p-4 sm:grid-cols-2">
          <Labelled label="Name">
            <Input value={form.name} onChange={set("name")} />
          </Labelled>
          <Labelled label="Organisation">
            <Input value={form.organisation} onChange={set("organisation")} />
          </Labelled>
          <Labelled label="URL" full>
            <Input value={form.url} onChange={set("url")} />
          </Labelled>
          <Labelled label="Update cadence (label)">
            <Input
              value={form.update_frequency}
              onChange={set("update_frequency")}
            />
          </Labelled>
          <Labelled label="Review interval (days, blank = none)">
            <input
              value={form.review_interval_days ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  review_interval_days:
                    e.target.value.trim() === ""
                      ? null
                      : Number(e.target.value),
                }))
              }
              inputMode="numeric"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </Labelled>
          <Labelled label="Description" full>
            <Input value={form.description} onChange={set("description")} />
          </Labelled>
          <Labelled label="Notes" full>
            <Input value={form.notes} onChange={set("notes")} />
          </Labelled>
          <div className="sm:col-span-2">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
            >
              Save source
            </button>
          </div>
        </div>
      )}

      {/* Provided parameters */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Reference data provided
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {source.params.map((p) => {
                const st = p.needsVerification
                  ? "needs"
                  : !p.lastVerifiedAt
                    ? "unverified"
                    : "verified";
                return (
                  <tr key={p.key} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink">{p.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">
                      {fmtVal(p.unit, p.value)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {st === "needs" ? (
                        <span className="text-xs text-warning-text">needs check</span>
                      ) : st === "unverified" ? (
                        <span className="text-xs text-muted">unverified</span>
                      ) : (
                        <span className="text-xs text-success-text">
                          verified {fmtDate(p.lastVerifiedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Labelled({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
function Input({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent"
    />
  );
}

export default function SourcesManager({
  email,
  activeFY,
  sources,
  staleCount,
  dueCount,
}: {
  email: string;
  activeFY: string;
  sources: SourceView[];
  staleCount: number;
  dueCount: number;
}) {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Calculator
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="sources" staleCount={staleCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Sources
        </div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Reference data sources</h1>
        <p className="mt-2 text-muted">
          Where each figure comes from, when it was last refreshed, and which
          parameters it feeds (values shown for the active FY{activeFY} version).
        </p>
      </header>

      {/* Staleness summary */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-5 py-4 text-sm">
        <span className="font-semibold text-ink">{sources.length} sources</span>
        {staleCount > 0 ? (
          <span className="text-danger-text">{staleCount} stale</span>
        ) : (
          <span className="text-success-text">none stale</span>
        )}
        {dueCount > 0 && <span className="text-warning-text">{dueCount} due soon</span>}
      </div>

      <div className="space-y-5">
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </div>
    </main>
  );
}
