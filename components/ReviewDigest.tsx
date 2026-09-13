"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { updateParam, verifyParam } from "@/app/actions/admin";
import { markSourceUpdated } from "@/app/actions/sources";
import type { ReviewData } from "@/lib/refdata";
import { driftByCategory } from "@/lib/au/drift";
import { fmtParamValue } from "@/lib/au/params";

export default function ReviewDigest({
  email,
  data,
}: {
  email: string;
  data: ReviewData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) setNotice(res.error);
      else {
        setNotice(ok);
        router.refresh();
      }
    });

  const pct =
    data.paramsTotal > 0
      ? Math.round((data.verified / data.paramsTotal) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Your leases
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="review" staleCount={data.staleSources.length} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Review
        </div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Due for review</h1>
        <p className="mt-2 text-muted">
          Everything needing attention for the active FY{data.activeFY ?? "—"}{" "}
          reference data.
        </p>
      </header>

      {notice && (
        <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {notice}
        </p>
      )}

      {data.dueTotal === 0 ? (
        <div className="rounded-2xl border border-success/40 bg-success-subtle p-8 text-center">
          <div className="text-3xl">✅</div>
          <h2 className="mt-2 text-xl font-bold text-ink">All caught up</h2>
          <p className="mt-1 text-sm text-muted">
            Every parameter is verified and no source is due for a refresh.
          </p>
        </div>
      ) : (
        <>
          {/* Verification progress */}
          <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Verification progress</h2>
              <span className="text-sm text-muted">
                {data.verified}/{data.paramsTotal} verified
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {data.flaggedCount > 0 && (
                <span className="text-warning-text">
                  {data.flaggedCount} flagged for review
                </span>
              )}
              {data.neverVerifiedCount > 0 && (
                <span className="text-muted">
                  {data.neverVerifiedCount} never verified
                </span>
              )}
              <Link
                href="/admin"
                className="ml-auto font-medium text-accent hover:underline"
              >
                Open parameters →
              </Link>
            </div>
          </section>

          {/* What we serve, against what the source says. First, because
              unlike everything else on this page it is not a reminder to look
              at something — it is a number that is wrong right now. */}
          {data.drift.length > 0 && (
            <section className="mb-6 rounded-2xl border border-danger/40 bg-panel p-6">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-danger-text">
                  {data.drift.length === 1
                    ? "1 parameter disagrees with the source"
                    : `${data.drift.length} parameters disagree with the source`}
                </h2>
                <Link href="/admin" className="text-sm font-medium text-accent hover:underline">
                  Open parameters →
                </Link>
              </div>
              <p className="mb-4 max-w-2xl text-sm text-subtle">
                The site serves what is stored here, not what is in{" "}
                <code className="rounded bg-panel-2 px-1 py-0.5 text-xs">config.ts</code>. A fix
                made in code does not arrive on its own — these are the ones that haven&apos;t.
                Adopting writes the code value to this version and logs it; leave it if the stored
                figure is a deliberate override.
              </p>
              <div className="space-y-4">
                {driftByCategory(data.drift).map(([category, rows]) => (
                  <div key={category}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      {category}
                    </div>
                    <div className="space-y-2">
                      {rows.map((d) => (
                        <div
                          key={d.key}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-danger/40 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-ink">{d.label}</div>
                            <div className="text-xs text-muted">
                              <code>{d.path}</code>
                            </div>
                          </div>
                          <div className="ml-auto flex items-baseline gap-2 text-sm tabular-nums">
                            <span className="text-danger-text line-through">
                              {fmtParamValue(d.active, d.unit)}
                            </span>
                            <span aria-hidden className="text-muted">
                              →
                            </span>
                            <span className="font-semibold text-success-text">
                              {fmtParamValue(d.expected, d.unit)}
                            </span>
                          </div>
                          {data.versionId && (
                            <button
                              onClick={() =>
                                run(
                                  () =>
                                    updateParam(data.versionId as string, d.key, d.expected),
                                  `${d.label} set to ${fmtParamValue(d.expected, d.unit)}.`,
                                )
                              }
                              disabled={pending}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-success/40 hover:text-success-text disabled:opacity-60"
                            >
                              Adopt
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sources to refresh */}
          {(data.staleSources.length > 0 || data.dueSources.length > 0) && (
            <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-ink">Sources to refresh</h2>
                <Link
                  href="/admin/sources"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Manage sources →
                </Link>
              </div>
              <div className="space-y-2">
                {[...data.staleSources, ...data.dueSources].map((s) => {
                  const stale = data.staleSources.includes(s);
                  return (
                    <div
                      key={s.key}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                        stale ? "border-danger/40" : "border-warning/40"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-ink">{s.name}</div>
                        <div className="text-xs text-muted">
                          {s.organisation} · {s.paramCount} params
                        </div>
                      </div>
                      <div
                        className={`text-xs ${stale ? "text-danger-text" : "text-warning-text"}`}
                      >
                        {s.lastUpdatedFrom == null
                          ? "never refreshed"
                          : stale
                            ? `${s.overdueDays}d overdue`
                            : `due in ${Math.abs(s.overdueDays ?? 0)}d`}
                      </div>
                      <button
                        onClick={() =>
                          run(
                            () => markSourceUpdated(s.key),
                            `Marked ${s.name} refreshed.`,
                          )
                        }
                        disabled={pending}
                        className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
                      >
                        Mark refreshed
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Parameters flagged for review */}
          {data.flaggedParams.length > 0 && (
            <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-ink">
                  Parameters flagged for review
                </h2>
                <Link
                  href="/admin"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Open parameters →
                </Link>
              </div>
              <div className="space-y-2">
                {data.flaggedParams.map((p) => (
                  <div
                    key={p.key}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-ink">{p.label}</div>
                      <div className="text-xs text-muted">
                        {p.category} · {p.sourceName}
                      </div>
                    </div>
                    {data.versionId && (
                      <button
                        onClick={() =>
                          run(
                            () => verifyParam(data.versionId as string, p.key),
                            `Verified ${p.label}.`,
                          )
                        }
                        disabled={pending}
                        className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-success/40 hover:text-success-text disabled:opacity-60"
                      >
                        Verify
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {data.neverVerifiedCount > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Plus {data.neverVerifiedCount} parameters never verified —
                  review them on the{" "}
                  <Link href="/admin" className="text-accent hover:underline">
                    Parameters
                  </Link>{" "}
                  page.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
