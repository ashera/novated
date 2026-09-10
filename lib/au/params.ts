// Descriptors that turn the nested EngineConfig into a flat, editable, auditable
// list of parameters for the admin backoffice. Each descriptor knows its label,
// category, unit, authoritative source, and how to read/write its value in the
// config object (by dot/index path).

import { DEFAULT_CONFIG, type EngineConfig } from "./config";

// "percent" values are STORED as a fraction (0.47) and edited as a percentage;
// "percentPoint" values are stored as the percentage number itself (7.5).
export type Unit = "percent" | "percentPoint" | "aud" | "count";

export interface ParamDescriptor {
  key: string;
  label: string;
  category: string;
  path: string; // e.g. "fbt.statutoryRate" or "tax.brackets.2.rate"
  unit: Unit;
  sourceKey: string; // references a first-class source (see lib/au/sources.ts)
}

/** One editable param per tax bracket threshold, rate and cumulative base, so a
 *  bracket change is a backoffice edit rather than a deploy. The top bracket's
 *  threshold is Infinity and therefore not editable. */
function taxBracketDescriptors(): ParamDescriptor[] {
  const rows: ParamDescriptor[] = [];
  DEFAULT_CONFIG.tax.brackets.forEach((b, i) => {
    const label = Number.isFinite(b.upTo)
      ? `Bracket ${i + 1} — up to $${b.upTo.toLocaleString()}`
      : `Bracket ${i + 1} — top`;
    if (Number.isFinite(b.upTo)) {
      rows.push({
        key: `tax_bracket_${i}_upto`,
        label: `${label}: threshold`,
        category: "Income tax",
        path: `tax.brackets.${i}.upTo`,
        unit: "aud",
        sourceKey: "ato-individual-rates",
      });
    }
    rows.push({
      key: `tax_bracket_${i}_rate`,
      label: `${label}: marginal rate`,
      category: "Income tax",
      path: `tax.brackets.${i}.rate`,
      unit: "percent",
      sourceKey: "ato-individual-rates",
    });
    rows.push({
      key: `tax_bracket_${i}_base`,
      label: `${label}: tax at the threshold`,
      category: "Income tax",
      path: `tax.brackets.${i}.base`,
      unit: "aud",
      sourceKey: "ato-individual-rates",
    });
  });
  return rows;
}

function helpBandDescriptors(): ParamDescriptor[] {
  const rows: ParamDescriptor[] = [];
  DEFAULT_CONFIG.tax.helpBands.forEach((b, i) => {
    if (Number.isFinite(b.upTo)) {
      rows.push({
        key: `help_band_${i}_upto`,
        label: `HELP band ${i + 1} — threshold`,
        category: "Study loans",
        path: `tax.helpBands.${i}.upTo`,
        unit: "aud",
        sourceKey: "ato-help-rates",
      });
    }
    rows.push({
      key: `help_band_${i}_rate`,
      label: `HELP band ${i + 1} — repayment rate`,
      category: "Study loans",
      path: `tax.helpBands.${i}.rate`,
      unit: "percent",
      sourceKey: "ato-help-rates",
    });
  });
  return rows;
}

function residualDescriptors(): ParamDescriptor[] {
  return Object.keys(DEFAULT_CONFIG.lease.residualMinPct).map((term) => ({
    key: `residual_min_${term}yr`,
    label: `Minimum residual — ${term} year${term === "1" ? "" : "s"}`,
    category: "Lease terms",
    path: `lease.residualMinPct.${term}`,
    unit: "percentPoint",
    sourceKey: "ato-it2509",
  }));
}

export const PARAM_DESCRIPTORS: ParamDescriptor[] = [
  ...taxBracketDescriptors(),

  // Offsets and levies
  { key: "lito_max", label: "LITO — maximum offset", category: "Offsets & levies", path: "tax.lito.max", unit: "aud", sourceKey: "ato-individual-rates" },
  { key: "lito_full_upto", label: "LITO — full offset up to", category: "Offsets & levies", path: "tax.lito.fullUpTo", unit: "aud", sourceKey: "ato-individual-rates" },
  { key: "lito_first_taper_to", label: "LITO — first taper ends", category: "Offsets & levies", path: "tax.lito.firstTaperTo", unit: "aud", sourceKey: "ato-individual-rates" },
  { key: "lito_first_taper_rate", label: "LITO — first taper rate", category: "Offsets & levies", path: "tax.lito.firstTaperRate", unit: "percent", sourceKey: "ato-individual-rates" },
  { key: "lito_second_taper_rate", label: "LITO — second taper rate", category: "Offsets & levies", path: "tax.lito.secondTaperRate", unit: "percent", sourceKey: "ato-individual-rates" },
  { key: "medicare_rate", label: "Medicare levy rate", category: "Offsets & levies", path: "tax.medicare.rate", unit: "percent", sourceKey: "ato-medicare" },
  { key: "medicare_threshold", label: "Medicare levy — low-income threshold", category: "Offsets & levies", path: "tax.medicare.lowIncomeThreshold", unit: "aud", sourceKey: "ato-medicare" },
  { key: "medicare_shade_in", label: "Medicare levy — shade-in rate", category: "Offsets & levies", path: "tax.medicare.shadeInRate", unit: "percent", sourceKey: "ato-medicare" },

  ...helpBandDescriptors(),

  // Fringe benefits tax — the rules the whole lease structure turns on
  { key: "fbt_rate", label: "FBT rate", category: "Fringe benefits tax", path: "fbt.rate", unit: "percent", sourceKey: "ato-fbt-rates" },
  { key: "fbt_gross_up_1", label: "Type 1 gross-up rate", category: "Fringe benefits tax", path: "fbt.grossUpType1", unit: "count", sourceKey: "ato-fbt-rates" },
  { key: "fbt_gross_up_2", label: "Type 2 gross-up rate", category: "Fringe benefits tax", path: "fbt.grossUpType2", unit: "count", sourceKey: "ato-fbt-rates" },
  { key: "fbt_statutory_rate", label: "Statutory formula percentage", category: "Fringe benefits tax", path: "fbt.statutoryRate", unit: "percent", sourceKey: "ato-fbt-cars" },
  { key: "fbt_reporting_threshold", label: "Reportable fringe benefits threshold", category: "Fringe benefits tax", path: "fbt.reportingThreshold", unit: "aud", sourceKey: "ato-fbt-rates" },

  // GST and luxury car tax
  { key: "gst_rate", label: "GST rate", category: "GST & luxury car tax", path: "gst.rate", unit: "percent", sourceKey: "ato-gst-cars" },
  { key: "gst_car_limit", label: "Car limit (GST credit + depreciation cap)", category: "GST & luxury car tax", path: "gst.carLimit", unit: "aud", sourceKey: "ato-gst-cars" },
  { key: "lct_rate", label: "Luxury car tax rate", category: "GST & luxury car tax", path: "lct.rate", unit: "percent", sourceKey: "ato-lct" },
  { key: "lct_threshold_fe", label: "LCT threshold — fuel-efficient vehicles", category: "GST & luxury car tax", path: "lct.thresholdFuelEfficient", unit: "aud", sourceKey: "ato-lct" },
  { key: "lct_threshold_other", label: "LCT threshold — other vehicles", category: "GST & luxury car tax", path: "lct.thresholdOther", unit: "aud", sourceKey: "ato-lct" },

  ...residualDescriptors(),

  // Lease conventions
  { key: "lease_default_term", label: "Default lease term", category: "Lease terms", path: "lease.defaultTermYears", unit: "count", sourceKey: "market-lease-terms" },
  { key: "lease_default_rate", label: "Default financier interest rate", category: "Lease terms", path: "lease.defaultInterestRatePct", unit: "percentPoint", sourceKey: "market-lease-terms" },
  { key: "lease_admin_fee", label: "Lease management fee (annual)", category: "Lease terms", path: "lease.defaultAdminFeeAnnual", unit: "aud", sourceKey: "market-lease-terms" },
  { key: "lease_establishment_fee", label: "Establishment fee (one-off)", category: "Lease terms", path: "lease.defaultEstablishmentFee", unit: "aud", sourceKey: "market-lease-terms" },
  { key: "lease_pay_cycles", label: "Pay cycles per year", category: "Lease terms", path: "lease.payCyclesPerYear", unit: "count", sourceKey: "market-lease-terms" },
  { key: "lease_lca_pct", label: "Luxury car adjustment (% of amount over the car limit)", category: "Lease terms", path: "lease.luxuryCarAdjustmentPct", unit: "percentPoint", sourceKey: "market-quote-sample" },

  // Market benchmarks — what a quote's figures are judged against.
  { key: "bench_loan_rate", label: "Comparable car loan rate", category: "Quote benchmarks", path: "benchmarks.loanRatePct", unit: "percentPoint", sourceKey: "market-quote-sample" },
  { key: "bench_rate_concern", label: "Finance rate flagged at or above", category: "Quote benchmarks", path: "benchmarks.rateConcernPct", unit: "percentPoint", sourceKey: "market-quote-sample" },
  { key: "bench_mgmt_low", label: "Management fee — market low", category: "Quote benchmarks", path: "benchmarks.managementFeeAnnual.low", unit: "aud", sourceKey: "market-quote-sample" },
  { key: "bench_mgmt_high", label: "Management fee — market high", category: "Quote benchmarks", path: "benchmarks.managementFeeAnnual.high", unit: "aud", sourceKey: "market-quote-sample" },
  { key: "bench_ins_low", label: "Insurance — market low (% of value)", category: "Quote benchmarks", path: "benchmarks.insurancePctOfValue.low", unit: "percentPoint", sourceKey: "market-quote-sample" },
  { key: "bench_ins_high", label: "Insurance — market high (% of value)", category: "Quote benchmarks", path: "benchmarks.insurancePctOfValue.high", unit: "percentPoint", sourceKey: "market-quote-sample" },
  { key: "bench_running_tolerance", label: "Running-cost budget tolerance", category: "Quote benchmarks", path: "benchmarks.runningCostTolerancePct", unit: "percentPoint", sourceKey: "market-quote-sample" },

  // Running-cost benchmarks
  { key: "run_litres_100km", label: "Fuel use — litres per 100km", category: "Running costs", path: "running.fuel.litresPer100km", unit: "count", sourceKey: "green-vehicle-guide" },
  { key: "run_price_litre", label: "Fuel price per litre", category: "Running costs", path: "running.fuel.pricePerLitre", unit: "aud", sourceKey: "aip-fuel-prices" },
  { key: "run_kwh_100km", label: "EV energy use — kWh per 100km", category: "Running costs", path: "running.fuel.kwhPer100km", unit: "count", sourceKey: "green-vehicle-guide" },
  { key: "run_price_kwh", label: "Electricity price per kWh", category: "Running costs", path: "running.fuel.pricePerKwh", unit: "aud", sourceKey: "aer-electricity" },
  { key: "run_service_base", label: "Servicing — annual base", category: "Running costs", path: "running.servicing.annualBase", unit: "aud", sourceKey: "raa-running-costs" },
  { key: "run_service_per_km", label: "Servicing — per km", category: "Running costs", path: "running.servicing.perKm", unit: "count", sourceKey: "raa-running-costs" },
  { key: "run_service_ev_mult", label: "Servicing — EV multiplier", category: "Running costs", path: "running.servicing.evMultiplier", unit: "percent", sourceKey: "raa-running-costs" },
  { key: "run_tyre_set", label: "Tyres — cost per set", category: "Running costs", path: "running.tyres.setCost", unit: "aud", sourceKey: "raa-running-costs" },
  { key: "run_tyre_km", label: "Tyres — km per set", category: "Running costs", path: "running.tyres.kmPerSet", unit: "count", sourceKey: "raa-running-costs" },
  { key: "run_registration", label: "Registration + CTP (annual)", category: "Running costs", path: "running.registrationAnnual", unit: "aud", sourceKey: "raa-running-costs" },
  { key: "run_insurance_pct", label: "Insurance — % of vehicle value", category: "Running costs", path: "running.insurance.pctOfValue", unit: "percentPoint", sourceKey: "raa-running-costs" },
  { key: "run_insurance_min", label: "Insurance — minimum annual premium", category: "Running costs", path: "running.insurance.minAnnual", unit: "aud", sourceKey: "raa-running-costs" },
  { key: "run_roadside", label: "Roadside assistance (annual)", category: "Running costs", path: "running.roadsideAnnual", unit: "aud", sourceKey: "raa-running-costs" },
];

export const PARAM_CATEGORIES: string[] = [
  "Income tax",
  "Offsets & levies",
  "Study loans",
  "Fringe benefits tax",
  "GST & luxury car tax",
  "Lease terms",
  "Running costs",
  "Quote benchmarks",
];

// --- Path-based read/write over the config object ---

type Json = Record<string, unknown> | unknown[];

export function getByPath(obj: unknown, path: string): number {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null) return NaN;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "number" ? cur : NaN;
}

/** Immutably set a value at a dot/index path, returning a new object. */
export function setByPath<T>(obj: T, path: string, value: number | string): T {
  const segs = path.split(".");
  const clone: Json = Array.isArray(obj)
    ? [...(obj as unknown[])]
    : { ...(obj as Record<string, unknown>) };
  let cur: Json = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const child = (cur as Record<string, unknown>)[seg];
    const childClone: Json = Array.isArray(child)
      ? [...(child as unknown[])]
      : { ...(child as Record<string, unknown>) };
    (cur as Record<string, unknown>)[seg] = childClone;
    cur = childClone;
  }
  (cur as Record<string, unknown>)[segs[segs.length - 1]] = value;
  return clone as T;
}

export interface ParamRow extends ParamDescriptor {
  value: number;
}

export function configToRows(config: EngineConfig): ParamRow[] {
  // Fall back to the code default for any param the stored config predates, so
  // newly added parameters still appear in the backoffice with their default.
  return PARAM_DESCRIPTORS.map((d) => {
    const value = getByPath(config, d.path);
    return { ...d, value: Number.isNaN(value) ? getByPath(DEFAULT_CONFIG, d.path) : value };
  });
}
