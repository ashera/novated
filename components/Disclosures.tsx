"use client";

import { useState } from "react";
import type { EngineConfig } from "@/lib/au/config";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/**
 * The "general information only" statement plus an assumptions dialog. A
 * novated lease is a tax and finance arrangement, not a financial product we
 * recommend, so the standing position is: this explains how the rules work and
 * models YOUR numbers, and it is not personal advice. The assumptions dialog
 * reads its figures out of the live reference data, so it can never drift from
 * what the engine actually used.
 */
export default function Disclosures({ config }: { config: EngineConfig }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section
        aria-label="Important information"
        className="mt-4 rounded-xl border border-warning/40 bg-warning-subtle px-4 py-3 text-xs text-warning-text"
      >
        <p>
          <strong className="font-semibold">General information only — not financial or tax advice.</strong>{" "}
          This tool explains how novated leasing works under Australian tax law and models the
          figures you enter. It does <strong>not</strong> take into account your objectives,
          financial situation or needs, and it does not recommend any lease, financier or
          vehicle. Results are <strong>estimates</strong> in today&apos;s dollars using{" "}
          {config.financialYear} rates — a real quote will differ. Your employer must agree to
          the arrangement, and packaging can affect other income-tested entitlements. Consider
          advice from a registered tax agent or an Australian Financial Services licensee before
          committing.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            onClick={() => setOpen(true)}
            className="font-semibold underline underline-offset-2"
          >
            Assumptions &amp; limitations
          </button>
          <button
            onClick={() => window.print()}
            className="font-semibold underline underline-offset-2 print:hidden"
          >
            Print / save as PDF
          </button>
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#091e42]/54 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Assumptions and limitations"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-xl border border-line bg-panel p-6 text-sm shadow-[var(--shadow-overlay)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-ink">Assumptions &amp; limitations</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-muted transition hover:bg-panel-2 hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-subtle">
              Every rate below comes from the app&apos;s reference data for{" "}
              <strong className="text-ink">FY{config.financialYear}</strong>, which is
              maintained against its published source and dated in the backoffice.
            </p>

            <h3 className="mt-5 font-semibold text-ink">What the model assumes</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-subtle">
              <li>
                <strong>Today&apos;s dollars.</strong> Salary, fuel and service costs are held
                flat across the term, so a saving shown is a saving in money you recognise now.
                Real costs will drift with inflation.
              </li>
              <li>
                <strong>Income tax.</strong> Resident marginal rates, the low income tax offset
                (max {fmt(config.tax.lito.max)}) and the {pct(config.tax.medicare.rate)} Medicare
                levy. Tax relief on a packaged dollar is calculated as the actual difference the
                deduction makes to your tax, so bracket crossings and the LITO taper are handled
                properly rather than assumed away.
              </li>
              <li>
                <strong>Fringe benefits tax.</strong> The statutory formula at{" "}
                {pct(config.fbt.statutoryRate)} of the car&apos;s GST-inclusive base value, for a
                full FBT year. FBT is charged at {pct(config.fbt.rate)} on the grossed-up value
                (type 1 gross-up {config.fbt.grossUpType1}). We assume the car is available for
                private use all year and that no logbook or operating-cost method is used.
              </li>
              <li>
                <strong>The electric vehicle exemption.</strong> Battery-electric vehicles first
                held and used on or after {config.fbt.evExemption.firstHeldFrom} and priced at or
                below the luxury car tax threshold for fuel-efficient vehicles (
                {fmt(config.lct.thresholdFuelEfficient)}) are treated as exempt. Plug-in hybrids
                are treated as ineligible from {config.fbt.evExemption.phevEligibleUntil} unless a
                binding commitment was already in place.
              </li>
              <li>
                <strong>GST.</strong> The financier is assumed to claim the GST credit on the
                vehicle, capped at the car limit ({fmt(config.gst.carLimit)}), and on packaged
                running costs. Registration is budgeted without GST.
              </li>
              <li>
                <strong>The lease.</strong> Level monthly payments amortising to the residual,
                which defaults to the ATO minimum for the term. Fees are the reference-data
                defaults ({fmt(config.lease.defaultAdminFeeAnnual)} a year management,{" "}
                {fmt(config.lease.defaultEstablishmentFee)} establishment) unless you override
                them.
              </li>
              <li>
                <strong>Running costs</strong> are benchmarks for a typical vehicle at your
                stated kilometres, not a quote for your car. Insurance scales with vehicle value;
                registration is a national midpoint and varies a lot by state.
              </li>
            </ul>

            <h3 className="mt-5 font-semibold text-ink">Significant limitations</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-subtle">
              <li>
                <strong>Your employer decides.</strong> Not every employer offers novated
                leasing, and those that do may use one provider, cap what can be packaged, or
                apply their own administration fee.
              </li>
              <li>
                <strong>A real quote will differ.</strong> Providers bundle fees, insurance and
                fuel cards in ways that vary widely, and the interest rate is often not disclosed
                separately. Use this to interrogate a quote, not to replace it.
              </li>
              <li>
                <strong>Leaving your job ends the novation.</strong> The lease reverts to you
                personally, paid from post-tax income, until a new employer takes it on.
              </li>
              <li>
                <strong>Reportable fringe benefits.</strong> Even an FBT-exempt EV is reported.
                That figure is not taxable income, but it counts towards the Medicare levy
                surcharge, HELP repayment income, child support and family assistance.
              </li>
              <li>
                <strong>The residual is a real obligation.</strong> If the car is worth less than
                the residual at the end of the term, the shortfall is yours.
              </li>
              <li>
                <strong>State and personal variation.</strong> Stamp duty, registration, CTP and
                insurance vary by state and by driver. GST treatment of specific running costs
                can vary between providers.
              </li>
            </ul>

            <button
              onClick={() => setOpen(false)}
              className="mt-6 rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
