"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import type { LeaseResult } from "@/lib/au/novated";

/**
 * Total cost over the lease term, three ways. Each column funds the SAME car
 * over the SAME period and leaves the buyer owing the same residual, so the
 * only thing that differs is how it is paid for — which is the comparison a
 * novated lease actually needs to win or lose on.
 */
export default function CostComparisonChart({ result }: { result: LeaseResult }) {
  const c = result.comparison;
  const years = result.inputs.termYears;

  const data = [
    { name: "Novated lease", value: c.lease.totalCost, highlight: true },
    { name: "Car loan", value: c.loan.totalCost, highlight: false },
    { name: "Paid in cash", value: c.cash.totalCost, highlight: false },
  ];

  const best = Math.min(...data.map((d) => d.value));

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">
          What it costs you over {years} year{years === 1 ? "" : "s"}
        </h3>
        <span className="text-xs text-muted">Running costs included in every column</span>
      </div>

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "var(--color-subtle)", fontSize: 12 }}
              axisLine={{ stroke: "var(--color-line)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => fmtCompact(v)}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip
              cursor={{ fill: "var(--color-panel-2)" }}
              formatter={(v: number) => [fmtCurrency(v), "Total cost"]}
              contentStyle={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--color-ink)",
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={88}>
              {data.map((d) => (
                <Cell
                  key={d.name}
                  fill={
                    d.value === best
                      ? "var(--color-success)"
                      : d.highlight
                        ? "var(--color-accent)"
                        : "var(--color-line-bold)"
                  }
                />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => fmtCompact(v)}
                style={{ fill: "var(--color-ink)", fontSize: 12, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-sm text-subtle">
        {c.savingVsLoan > 0 ? (
          <>
            The lease works out{" "}
            <strong className="text-success-text">{fmtCurrency(c.savingVsLoan)} cheaper</strong> than
            a car loan over the term, before the residual.
          </>
        ) : (
          <>
            The lease works out{" "}
            <strong className="text-danger-text">{fmtCurrency(-c.savingVsLoan)} dearer</strong> than
            a car loan over the term, before the residual.
          </>
        )}{" "}
        All three leave {fmtCurrency(result.finance.residual)} owing on the car at the end.
      </p>
    </section>
  );
}
