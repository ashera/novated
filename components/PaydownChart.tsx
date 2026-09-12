"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { amortisationSchedule, type LeaseResult } from "@/lib/au/novated";

/**
 * What is still owed, over the life of the lease.
 *
 * Drawn rather than described because the shape says two things a sentence
 * struggles to. It stops on the residual instead of reaching zero — that flat
 * line at the bottom is the lump still owing on the last day, and watching the
 * curve arrive at it rather than at the axis is the clearest way to make the
 * point. And it is a curve, not a line: interest is charged on the balance, so
 * a bigger share of each early payment goes to interest and the debt comes
 * down more slowly at the start.
 */
export default function PaydownChart({ result }: { result: LeaseResult }) {
  const { finance, inputs, term } = result;
  const months = term.years * 12;
  const data = amortisationSchedule(
    finance.amountFinanced,
    finance.residual,
    inputs.interestRatePct,
    months,
  ).map((p) => ({
    month: p.month,
    balance: p.balance,
    year: p.month / 12,
  }));

  // The two ends of the curve, which is what makes it a curve.
  const at = (m: number) => data[Math.min(Math.max(0, m), months)].balance;
  const firstYearPrincipal = at(0) - at(12);
  const lastYearPrincipal = at(months - 12) - at(months);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">What you still owe on the car</h4>
        <span className="text-xs text-muted">
          {fmtCurrency(finance.monthlyPayment)} a month
        </span>
      </div>

      <div className="mt-3 h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="paydown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, months]}
              // A tick a year: months are the data, years are how people think
              // about a lease term.
              ticks={Array.from({ length: term.years + 1 }, (_, i) => i * 12)}
              tickFormatter={(m: number) => (m === 0 ? "Start" : `${m / 12}y`)}
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
              domain={[0, "dataMax"]}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-line-bold)" }}
              formatter={(v: number) => [fmtCurrency(v), "Still owing"]}
              labelFormatter={(m: number) =>
                m === 0 ? "At the start" : `After ${m} month${m === 1 ? "" : "s"}`
              }
              contentStyle={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--color-ink)",
              }}
            />
            <ReferenceLine
              y={finance.residual}
              stroke="var(--color-warning-text)"
              strokeDasharray="4 4"
              label={{
                value: `Residual ${fmtCompact(finance.residual)}`,
                // Left, because the curve lands on this line at the right —
                // a label there sits on top of the thing it describes.
                position: "insideBottomLeft",
                fill: "var(--color-warning-text)",
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#paydown)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-sm text-subtle">
        The line stops at the {fmtCurrency(finance.residual)} residual rather than at zero — that
        is the part the lease deliberately doesn&apos;t pay off. It also comes down more slowly
        at the start, because interest is charged on whatever is still owing: the first year
        clears {fmtCurrency(firstYearPrincipal)} of the {fmtCurrency(finance.amountFinanced)}{" "}
        financed, the last {fmtCurrency(lastYearPrincipal)}.
      </p>
    </div>
  );
}
