"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  activateVersion,
  createNextVersion,
  updateParam,
  verifyParam,
} from "@/app/actions/admin";
import AdminTabs from "@/components/AdminTabs";
import { PARAM_CATEGORIES, type Unit } from "@/lib/au/params";
import { fmtCurrency } from "@/lib/au/format";

interface Meta {
  source: string;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  note: string;
  needsVerification: boolean;
}
interface Row {
  key: string;
  label: string;
  category: string;
  path: string;
  unit: Unit;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string | null;
  value: number;
  meta: Meta | null;
}
interface VersionLite {
  id: string;
  financial_year: string;
  is_active: boolean;
  status: string;
}
interface AuditEntry {
  id: string;
  param_key: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

function toDisplay(unit: Unit, value: number): string {
  if (unit === "percent") return String(+(value * 100).toFixed(4));
  return String(value); // percentPoint values are already a percentage number
}
function fromDisplay(unit: Unit, display: string): number {
  const n = parseFloat(display);
  if (!isFinite(n)) return NaN;
  return unit === "percent" ? n / 100 : n;
}
function unitSuffix(unit: Unit): string {
  return unit === "percent" || unit === "percentPoint" ? "%" : "";
}
function formatValue(unit: Unit, value: number): string {
  if (unit === "percent") return `${+(value * 100).toFixed(3)}%`;
  if (unit === "percentPoint") return `${+value.toFixed(3)}%`;
  if (unit === "aud") return fmtCurrency(value);
  return String(+value.toFixed(4));
}
function relDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ meta }: { meta: Meta | null }) {
  if (meta?.needsVerification)
    return (
      <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-text">
        Needs check
      </span>
    );
  if (!meta?.lastVerifiedAt)
    return (
      <span className="rounded-full bg-line-bold/15 px-2 py-0.5 text-xs font-medium text-muted">
        Unverified
      </span>
    );
  return (
    <span className="rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">
      Verified
    </span>
  );
}

export default function AdminBackoffice({
  email,
  versions,
  current,
  rows,
  audit,
  staleSourceCount,
}: {
  email: string;
  versions: VersionLite[];
  current: VersionLite & { notes: string | null; updated_at: string };
  rows: Row[];
  audit: AuditEntry[];
  staleSourceCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) setNotice(res.error);
      else {
        setNotice(ok);
        router.refresh();
      }
    });

  const saveEdit = (row: Row) => {
    const raw = edits[row.key];
    if (raw === undefined) return;
    const value = fromDisplay(row.unit, raw);
    if (!isFinite(value)) {
      setNotice(`Invalid value for ${row.label}.`);
      return;
    }
    run(() => updateParam(current.id, row.key, value), `Updated ${row.label}.`);
    setEdits((e) => {
      const n = { ...e };
      delete n[row.key];
      return n;
    });
  };

  const verified = rows.filter(
    (r) => r.meta?.lastVerifiedAt && !r.meta?.needsVerification,
  ).length;
  const needsCheck = rows.filter((r) => r.meta?.needsVerification).length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Calculator
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="parameters" staleCount={staleSourceCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Reference data
        </div>
        <h1 className="mt-1 text-3xl font-bold text-ink">
          Engine configuration
        </h1>
        <p className="mt-2 text-muted">
          The rates the lease engine runs on. The{" "}
          <span className="text-accent">active</span> version drives every
          calculation. Edits and verifications are audited.
        </p>
      </header>

      {/* Version controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Financial year
        </span>
        {versions.map((v) => (
          <Link
            key={v.id}
            href={`/admin?v=${v.id}`}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              v.id === current.id
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-line text-ink hover:border-accent/40"
            }`}
          >
            FY{v.financial_year}
            {v.is_active && (
              <span className="ml-1.5 text-xs text-success-text">● active</span>
            )}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {!current.is_active && (
            <button
              onClick={() =>
                run(() => activateVersion(current.id), `FY${current.financial_year} is now active.`)
              }
              disabled={pending}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
            >
              Activate this version
            </button>
          )}
          <button
            onClick={() =>
              startTransition(async () => {
                const res = await createNextVersion();
                if (res.error) setNotice(res.error);
                else if (res.id) {
                  setNotice("Created next-year draft.");
                  router.push(`/admin?v=${res.id}`);
                }
              })
            }
            disabled={pending}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/50 disabled:opacity-60"
          >
            + Roll forward next FY
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-5 py-4 text-sm">
        <span className="font-semibold text-ink">
          FY{current.financial_year}
        </span>
        <span
          className={
            current.is_active ? "text-success-text" : "text-muted"
          }
        >
          {current.status}
        </span>
        <span className="text-muted">
          {verified}/{rows.length} verified
        </span>
        {needsCheck > 0 && (
          <span className="text-warning-text">{needsCheck} need checking</span>
        )}
        <span className="ml-auto text-xs text-muted">
          updated {relDate(current.updated_at)}
        </span>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {notice}
        </p>
      )}

      {/* Parameter tables by category */}
      {PARAM_CATEGORIES.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat);
        if (!catRows.length) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {cat}
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
              <table className="w-full text-sm">
                <tbody>
                  {catRows.map((row) => {
                    const editing = edits[row.key] !== undefined;
                    return (
                      <tr
                        key={row.key}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {row.label}
                          </div>
                          {row.sourceUrl ? (
                            <a
                              href={row.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted hover:text-accent"
                            >
                              {row.sourceName} ↗
                            </a>
                          ) : (
                            <span className="text-xs text-muted">
                              {row.sourceName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              value={
                                editing
                                  ? edits[row.key]
                                  : toDisplay(row.unit, row.value)
                              }
                              onChange={(e) =>
                                setEdits((s) => ({ ...s, [row.key]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(row);
                              }}
                              inputMode="decimal"
                              className="w-28 rounded-lg border border-line bg-panel-2 px-2 py-1 text-right tabular-nums text-ink outline-none focus:border-accent"
                            />
                            <span className="w-8 text-left text-xs text-muted">
                              {unitSuffix(row.unit)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {formatValue(row.unit, row.value)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge meta={row.meta} />
                          {row.meta?.lastVerifiedAt && (
                            <div className="mt-0.5 text-xs text-muted">
                              {relDate(row.meta.lastVerifiedAt)}
                              {row.meta.verifiedBy ? ` · ${row.meta.verifiedBy}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {editing && (
                              <button
                                onClick={() => saveEdit(row)}
                                disabled={pending}
                                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-60"
                              >
                                Save
                              </button>
                            )}
                            <button
                              onClick={() =>
                                run(
                                  () => verifyParam(current.id, row.key),
                                  `Verified ${row.label}.`,
                                )
                              }
                              disabled={pending}
                              className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-success/40 hover:text-success-text disabled:opacity-60"
                            >
                              Verify
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Audit history */}
      <section className="mb-10">
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted hover:text-ink"
        >
          Change history ({audit.length}) {showHistory ? "▲" : "▼"}
        </button>
        {showHistory && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
            <table className="w-full text-sm">
              <tbody>
                {audit.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-muted">No changes yet.</td>
                  </tr>
                )}
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                      {new Date(a.changed_at).toLocaleString("en-AU")}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium capitalize text-ink">
                        {a.action}
                      </span>
                      {a.param_key && (
                        <span className="ml-1 text-ink">{a.param_key}</span>
                      )}
                      {a.action === "edit" && (
                        <span className="ml-1 text-muted">
                          {a.old_value} → {a.new_value}
                        </span>
                      )}
                      {a.note && <span className="ml-1 text-muted">— {a.note}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted">
                      {a.changed_by_email ?? "system"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
