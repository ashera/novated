"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
 *
 * The bars underneath are each month's payment, split into what retires the
 * debt and what is simply the cost of borrowing. They need their own axis: a
 * payment is a few hundred dollars against a balance in the tens of
 * thousands, so on one scale they would be invisible. Together the two say
 * the same thing twice over — the amber shrinks, the curve steepens — which
 * is exactly why the curve is a curve.
 */
export default function PaydownChart({ result }: { result: LeaseResult }) {
  const { finance, inputs, term } = result;
  const months = term.years * 12;
  const data = amortisationSchedule(
    finance.amountFinanced,
    finance.residual,
    inputs.interestRatePct,
    months,
  )
    // Month 0 is the day it starts: a balance, but no payment to split.
    .filter((p) => p.month > 0)
    .map((p) => ({
      month: p.month,
      balance: p.balance,
      principal: p.principal,
      interest: p.interest,
    }));

  // The two ends of the curve, which is what makes it a curve.
  const at = (m: number) =>
    m <= 0 ? finance.amountFinanced : data[Math.min(m, months) - 1].balance;
  const firstYearPrincipal = at(0) - at(12);
  const lastYearPrincipal = at(months - 12) - at(months);
  const firstInterest = data[0]?.interest ?? 0;
  const lastInterest = data[data.length - 1]?.interest ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">What you still owe on the car</h4>
        <span className="text-xs text-muted">
          {fmtCurrency(finance.monthlyPayment)} a month
        </span>
      </div>

      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            {/* A category axis: one band per payment, which is the scale bars
                actually want. Month 0 is not in the data — it has a balance
                but no payment to split — so the first band is the first
                payment. */}
            <XAxis
              dataKey="month"
              // A tick a year: months are the data, years are how people think
              // about a lease term.
              ticks={Array.from({ length: term.years }, (_, i) => (i + 1) * 12)}
              tickFormatter={(m: number) => `${m / 12}y`}
              tick={{ fill: "var(--color-subtle)", fontSize: 12 }}
              axisLine={{ stroke: "var(--color-line)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              yAxisId="balance"
              tickFormatter={(v: number) => fmtCompact(v)}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={54}
              domain={[0, "dataMax"]}
            />
            {/* The payments get their own scale, and their own side, so the
                two are never read off each other by mistake. */}
            <YAxis
              yAxisId="payment"
              orientation="right"
              tickFormatter={(v: number) => fmtCompact(v)}
              tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              domain={[0, Math.round(finance.monthlyPayment * 1.15)]}
            />
            <Tooltip
              cursor={{ fill: "var(--color-panel-2)" }}
              formatter={(v: number, name: string) => [fmtCurrency(v), name]}
              labelFormatter={(m: number) => `Payment ${m} of ${months}`}
              contentStyle={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--color-ink)",
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={24}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
            />
            <Bar
              yAxisId="payment"
              dataKey="principal"
              name="Paying off the car"
              stackId="payment"
              fill="var(--color-accent-border)"
              fillOpacity={0.75}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="payment"
              dataKey="interest"
              name="Interest"
              stackId="payment"
              fill="var(--color-warning)"
              fillOpacity={0.75}
              isAnimationActive={false}
            />
            {/* Both of these draw after the bars, because order is z-order
                and the residual line is the point of the chart — behind a
                stack of bars it may as well not be there. */}
            <ReferenceLine
              yAxisId="balance"
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
            <Line
              yAxisId="balance"
              type="monotone"
              dataKey="balance"
              name="Still owing"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-sm text-subtle">
        The line stops at the {fmtCurrency(finance.residual)} residual rather than at zero — that
        is the part the lease deliberately doesn&apos;t pay off. It also comes down more slowly
        at the start, because interest is charged on whatever is still owing: the first year
        clears {fmtCurrency(firstYearPrincipal)} of the {fmtCurrency(finance.amountFinanced)}{" "}
        financed, the last {fmtCurrency(lastYearPrincipal)}.
      </p>
      <p className="mt-1.5 text-sm text-subtle">
        The bars are the same story from underneath: every payment is the same{" "}
        {fmtCurrency(finance.monthlyPayment)}, but the interest in it falls from{" "}
        {fmtCurrency(firstInterest)} in the first month to {fmtCurrency(lastInterest)} in the
        last, and what is left goes on the car.
      </p>
    </div>
  );
}
