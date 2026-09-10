"use client";

import { useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import type { TestRun, TestResultRow } from "@/lib/refdata";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "passed"
      ? "bg-success-subtle text-success-text"
      : status === "failed"
        ? "bg-danger-subtle text-danger-text"
        : "bg-line-bold/15 text-muted";
  const label = status === "passed" ? "pass" : status === "failed" ? "fail" : "skip";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function AreaSection({
  area,
  rows,
}: {
  area: string;
  rows: TestResultRow[];
}) {
  const [showErrors, setShowErrors] = useState(true);
  const passed = rows.filter((r) => r.status === "passed").length;
  const allPass = passed === rows.length;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${allPass ? "bg-success" : "bg-danger"}`}
        />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
          {area}
        </h2>
        <span className="text-xs text-muted">
          {passed}/{rows.length} passing
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-2.5 text-ink">
                  {r.name}
                  {r.status === "failed" && r.error && showErrors && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-panel-3 p-3 text-[11px] leading-relaxed text-danger-text">
                      {r.error}
                    </pre>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted">
                  {r.duration_ms} ms
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.status === "failed") && (
        <button
          onClick={() => setShowErrors((s) => !s)}
          className="mt-1 text-xs text-muted hover:text-ink"
        >
          {showErrors ? "Hide" : "Show"} error details
        </button>
      )}
    </section>
  );
}

export default function TestsView({
  email,
  run,
  staleCount,
}: {
  email: string;
  run: TestRun | null;
  staleCount: number;
}) {
  const areas = new Map<string, TestResultRow[]>();
  for (const r of run?.results ?? []) {
    const list = areas.get(r.area) ?? [];
    list.push(r);
    areas.set(r.area, list);
  }
  const sortedAreas = [...areas.entries()].sort(([a], [b]) => a.localeCompare(b));
  const allPass = run ? run.failed === 0 : false;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Calculator
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="tests" staleCount={staleCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Feature Tests
        </div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Feature test suite</h1>
        <p className="mt-2 text-muted">
          Engine unit tests, grouped by area. Recorded by{" "}
          <code className="text-ink">npm run test:record</code>.
        </p>
      </header>

      {!run ? (
        <div className="rounded-2xl border border-line bg-panel p-8 text-center text-muted">
          No test runs recorded yet. Run{" "}
          <code className="text-ink">npm run test:record</code>.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-5 py-4 text-sm">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${allPass ? "bg-success-subtle text-success-text" : "bg-danger-subtle text-danger-text"}`}
            >
              {allPass ? "All passing" : `${run.failed} failing`}
            </span>
            <span className="font-semibold text-ink">
              {run.passed}/{run.total} passed
            </span>
            {run.skipped > 0 && (
              <span className="text-muted">{run.skipped} skipped</span>
            )}
            <span className="text-muted">{run.duration_ms} ms</span>
            <span className="ml-auto text-xs text-muted">
              last run {new Date(run.created_at).toLocaleString("en-AU")}
            </span>
          </div>

          {sortedAreas.map(([area, rows]) => (
            <AreaSection key={area} area={area} rows={rows} />
          ))}
        </>
      )}
    </main>
  );
}
