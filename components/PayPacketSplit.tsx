"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { LeaseResult } from "@/lib/au/novated";

/**
 * The single most useful picture in the whole app: where the salary actually
 * goes once a lease is packaged. A pre-tax dollar is deducted BEFORE tax is
 * calculated, so it shrinks the taxable slice; a post-tax dollar (the employee
 * contribution that cancels FBT) comes out of what's left. Showing both against
 * the un-packaged pay packet is what makes "salary sacrifice" click.
 *
 * Drawn as two stacked proportional bars rather than a chart library — the
 * shapes are simple, and CSS keeps them crisp at print resolution for the PDF.
 */

interface Segment {
  key: string;
  label: string;
  value: number;
  className: string;
}

function Bar({ title, total, segments }: { title: string; total: number; segments: Segment[] }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-subtle">{title}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">{fmtCurrency(total)}</span>
      </div>
      <div className="flex h-9 w-full overflow-hidden rounded-md border border-line bg-panel-2">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className={`flex items-center justify-center overflow-hidden ${s.className}`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${fmtCurrency(s.value)}`}
            >
              <span className="truncate px-1 text-[11px] font-semibold text-white">
                {(s.value / total) * 100 >= 11 ? fmtCurrency(s.value) : ""}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function PayPacketSplit({ result }: { result: LeaseResult }) {
  const { package: pkg, inputs } = result;
  const salary = inputs.salary;

  // Un-packaged: the whole salary is taxable, and the car (if they bought it any
  // other way) would be paid out of what's left.
  const beforeTax = salary - pkg.takeHomeBefore;

  const segments: Segment[] = [
    { key: "pretax", label: "Pre-tax lease deduction", value: pkg.preTaxAnnual, className: "bg-accent" },
    {
      key: "tax",
      label: "Income tax, Medicare and study loan",
      value: salary - pkg.preTaxAnnual - (pkg.takeHomeAfter + pkg.postTaxAnnual),
      className: "bg-line-bold",
    },
    { key: "posttax", label: "Post-tax employee contribution", value: pkg.postTaxAnnual, className: "bg-discovery" },
    { key: "take", label: "Take-home pay", value: Math.max(0, pkg.takeHomeAfter), className: "bg-success" },
  ];

  const legend = [
    { label: "Pre-tax deduction", className: "bg-accent" },
    { label: "Tax withheld", className: "bg-line-bold" },
    ...(pkg.postTaxAnnual > 0
      ? [{ label: "Post-tax contribution", className: "bg-discovery" }]
      : []),
    { label: "Take-home pay", className: "bg-success" },
  ];

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-ink">Where your salary goes</h3>
      <p className="mt-1 text-sm text-muted">
        The lease is deducted before tax is worked out, so the taxable slice shrinks.
        That is the whole mechanism.
      </p>

      <div className="mt-5 space-y-4">
        <Bar
          title="Without the lease"
          total={salary}
          segments={[
            { key: "tax", label: "Income tax, Medicare and study loan", value: beforeTax, className: "bg-line-bold" },
            { key: "take", label: "Take-home pay", value: pkg.takeHomeBefore, className: "bg-success" },
          ]}
        />
        <Bar title="With the lease packaged" total={salary} segments={segments} />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2.5 w-2.5 rounded-sm ${l.className}`} />
            {l.label}
          </span>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Tax you no longer pay</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-success-text">
            {fmtCurrency(pkg.taxSaved)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Take-home reduction</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
            {fmtCurrency(pkg.takeHomeReduction)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Relief rate on packaged $</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
            {(pkg.effectiveReliefRate * 100).toFixed(1)}%
          </dd>
        </div>
      </dl>
    </section>
  );
}
