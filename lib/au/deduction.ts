import type { EngineConfig } from "./config";
import type {
  FbtOutcome,
  LeaseFinance,
  LeaseInputs,
  RunningCostBreakdown,
} from "./novated";
import { QUOTE_LINE_ORDER, type QuoteDecode } from "./quote";

/**
 * What the employer deducts, itemised — from either of the two places it can
 * be known.
 *
 * The distinction is the whole reason this module exists, and getting it wrong
 * is what produced a breakdown that disagreed with the payslip it was meant to
 * explain:
 *
 *   MODELLED — worked out from the car, the rate and the term. What a lease
 *     would cost on these terms. It is the honest answer while nobody has a
 *     provider's document, and it is an estimate.
 *
 *   QUOTED — the provider's own line items, off the document the employer
 *     actually deducts against. Not an estimate, and not ours.
 *
 * Where a quote has been adopted, the quoted figures are the deduction and the
 * modelled ones are a second opinion about it. A page explaining a payslip has
 * to show the first; showing the second put $1,945 a month in front of
 * somebody whose payslip says $1,780.
 *
 * Pure, so both the table and its tests can ask the same question.
 */

export interface DeductionRow {
  key: string;
  label: string;
  /** Dollars a year. */
  annual: number;
  /** A running cost sitting under the lease payment, rather than a peer of it. */
  indent?: boolean;
}

export interface DeductionBreakdown {
  rows: DeductionRow[];
  /** The rows' own sum. */
  total: number;
  preTaxAnnual: number;
  postTaxAnnual: number;
  source: "modelled" | "quoted";
  /**
   * What the provider says comes out, where the document states it.
   *
   * Kept apart from `total` rather than replacing it, because when the two
   * differ that difference is itself the finding — most often an employer
   * keeping a share of the tax saving. Collapsing them would hide it.
   */
  statedDeduction: number | null;
}

/** From the engine's model of the lease. */
export function modelledDeduction(
  inputs: LeaseInputs,
  config: EngineConfig,
  finance: LeaseFinance,
  running: RunningCostBreakdown,
  fbt: FbtOutcome,
  preTaxAnnual: number,
  postTaxAnnual: number,
): DeductionBreakdown {
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;
  const rows: DeductionRow[] = [
    { key: "finance", label: "Lease payments", annual: finance.annualPayment },
  ];
  if (inputs.includeRunningCosts) {
    rows.push(
      { key: "fuel", label: "Fuel or charging", annual: running.fuel, indent: true },
      { key: "servicing", label: "Servicing", annual: running.servicing, indent: true },
      { key: "tyres", label: "Tyres", annual: running.tyres, indent: true },
      { key: "registration", label: "Registration and CTP", annual: running.registration, indent: true },
      { key: "insurance", label: "Insurance", annual: running.insurance, indent: true },
      { key: "roadside", label: "Roadside assistance", annual: running.roadside, indent: true },
    );
  }
  rows.push({ key: "adminFee", label: "Lease management fee", annual: adminFee });
  // In packagedTotal since the engine was written, and absent from the table
  // until a reader added the column up.
  if (finance.luxuryCarAdjustment > 0) {
    rows.push({
      key: "luxuryCarAdjustment",
      label: "Luxury car charge",
      annual: finance.luxuryCarAdjustment,
    });
  }
  if (fbt.fbtPayable > 0) {
    rows.push({
      key: "fbt",
      label: "Fringe benefits tax (grossed up)",
      annual: fbt.fbtPayable,
    });
  }
  return {
    rows,
    total: rows.reduce((t, r) => t + r.annual, 0),
    preTaxAnnual,
    postTaxAnnual,
    source: "modelled",
    statedDeduction: null,
  };
}

/**
 * From the provider's own quote.
 *
 * The lines are already annualised by the decoder at the quote's own
 * frequency, so nothing is re-derived here — this only names them and puts
 * them in a document's order.
 */
export function quotedDeduction(decode: QuoteDecode): DeductionBreakdown {
  const rows: DeductionRow[] = [];
  for (const { key, label } of QUOTE_LINE_ORDER) {
    const annual = decode.annualLines[key];
    if (typeof annual !== "number" || annual === 0) continue;
    rows.push({
      key,
      label: key === "finance" ? "Lease payments" : label,
      annual,
      indent: key !== "finance" && key !== "managementFee" && key !== "luxuryCarAdjustment",
    });
  }
  const total = rows.reduce((t, r) => t + r.annual, 0);
  return {
    rows,
    total,
    /* A quote's post-tax figure is the employee contribution where it states
       one; everything else it lists is sacrificed before tax. */
    preTaxAnnual: total,
    postTaxAnnual: 0,
    source: "quoted",
    statedDeduction: decode.annualStatedDeduction,
  };
}
