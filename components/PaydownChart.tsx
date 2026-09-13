"use client";

import {
  Area,
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
import { resaleValue } from "@/lib/au/resale";
import type { EngineConfig } from "@/lib/au/config";

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
 *
 * And over the top of both, what the car is likely to be WORTH. That is the
 * line that turns a chart into an answer: everywhere it sits below the balance
 * the car is worth less than is owed on it, and walking away costs money. The
 * residual on its own never said whether it was a formality or a bill.
 *
 * It is drawn as a band rather than a line because it is the one forecast on
 * the site — after two years an average Australian EV retained 68.7% of its
 * price, a Model 3 54% and a BYD Seal 78%, so the model matters more than the
 * curve and a single stroke would claim a precision nobody has.
 */
export default function PaydownChart({
  result,
  config,
}: {
  result: LeaseResult;
  config: EngineConfig;
}) {
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
    .map((p) => {
      // Against the CAR's price, not the drive-away total and not the amount
      // financed: nobody buying it second-hand pays back the stamp duty.
      const worth = resaleValue(inputs.vehiclePrice, inputs.fuelType, p.month, config);
      return {
        month: p.month,
        balance: p.balance,
        principal: p.principal,
        interest: p.interest,
        worth: worth.value,
        // Recharts draws a ranged area from a two-element array.
        worthRange: [worth.low, worth.high] as [number, number],
      };
    });

  // The two ends of the curve, which is what makes it a curve.
  const at = (m: number) =>
    m <= 0 ? finance.amountFinanced : data[Math.min(m, months) - 1].balance;
  const firstYearPrincipal = at(0) - at(12);
  const lastYearPrincipal = at(months - 12) - at(months);
  const firstInterest = data[0]?.interest ?? 0;
  const lastInterest = data[data.length - 1]?.interest ?? 0;

  // Where the two lines cross, which is the whole point of drawing them
  // together. Underwater until `surfaces`, and at the end by `endEquity`.
  const underwaterFrom = data.find((d) => d.worth < d.balance)?.month ?? null;
  const surfaces =
    underwaterFrom == null
      ? null
      : (data.find((d) => d.month > underwaterFrom && d.worth >= d.balance)?.month ?? null);
  const last = data[data.length - 1];
  const endEquity = last ? last.worth - last.balance : 0;

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
              formatter={(v: number | [number, number], name: string) =>
                Array.isArray(v)
                  ? [`${fmtCurrency(v[0])} – ${fmtCurrency(v[1])}`, name]
                  : [fmtCurrency(v), name]
              }
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
              // Spelled out rather than collected from the series: the band
              // and the line it surrounds are one idea and want one entry.
              payload={[
                { value: "Paying off the car", type: "circle", color: "var(--color-accent-border)" },
                { value: "Interest", type: "circle", color: "var(--color-warning)" },
                { value: "Still owing", type: "circle", color: "var(--color-accent)" },
                { value: "What it's worth", type: "circle", color: "var(--color-success)" },
              ]}
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
            {/* After the bars, because order is z-order and a band drawn
                underneath them is a band nobody can see. No legend entry: the
                dashed line it surrounds is already named, and "what it might
                be worth" next to "what it's worth" reads as two things. */}
            <Area
              yAxisId="balance"
              type="monotone"
              dataKey="worthRange"
              name="What it's worth"
              stroke="none"
              fill="var(--color-success)"
              fillOpacity={0.16}
              isAnimationActive={false}
              legendType="none"
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
              dataKey="worth"
              name="What it's worth"
              stroke="var(--color-success)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
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
      <p className="mt-1.5 text-sm text-subtle">
        {underwaterFrom == null ? (
          <>
            The green band is what the car might be worth — a range, because the model matters
            more than the average. It stays above what you owe for the whole term here, so
            ending early would not leave you short.
          </>
        ) : (
          <>
            <strong className="text-ink">
              From month {underwaterFrom}
              {surfaces ? ` to month ${surfaces}` : " onwards"}, the car is worth less than you
              owe on it.
            </strong>{" "}
            That is the gap between the two lines, and it is what you would have to find — out of
            already-taxed pay — if the lease ended there. By the end{" "}
            {endEquity >= 0 ? (
              <>
                it is worth about {fmtCurrency(endEquity)} more than the{" "}
                {fmtCurrency(finance.residual)} residual, so paying the residual and keeping it is
                the cheaper option.
              </>
            ) : (
              <>
                it is still about {fmtCurrency(Math.abs(endEquity))} short of the{" "}
                {fmtCurrency(finance.residual)} residual — which is the part of a lease nobody
                mentions at the start.
              </>
            )}{" "}
            The band is a forecast, not a rule like everything else here.
          </>
        )}
      </p>
    </div>
  );
}
