// The reference data the whole app calculates from — tax scales, FBT rules,
// lease conventions and running-cost benchmarks for one financial year.
//
// DEFAULT_CONFIG below is the code fallback and the seed for a new FY. Once the
// app is running, the ACTIVE config lives in `ref_data_versions` and is edited
// (and verified against its source) in the admin backoffice, so a rate change
// never needs a deploy. See lib/au/params.ts for the flat, editable view and
// lib/au/sources.ts for where each number comes from.

export interface TaxBracket {
  upTo: number;
  base: number; // cumulative tax at the bottom of this bracket
  rate: number; // marginal rate within it
}

export interface TaxConfig {
  brackets: TaxBracket[];
  lito: {
    max: number;
    fullUpTo: number; // full offset up to this income
    firstTaperTo: number;
    firstTaperRate: number;
    secondTaperRate: number;
  };
  medicare: {
    rate: number;
    lowIncomeThreshold: number;
    shadeInRate: number;
  };
  /** Compulsory study-loan repayment scale (marginal, from 1 July 2025). */
  helpBands: { upTo: number; rate: number }[];
}

export interface FbtConfig {
  /** FBT rate applied to the grossed-up taxable value. */
  rate: number;
  /** Type 1 gross-up (benefits the employer claimed a GST credit on). */
  grossUpType1: number;
  /** Type 2 gross-up (no GST credit) — also the RFBA gross-up. */
  grossUpType2: number;
  /** Statutory formula percentage — a flat 20% of base value since 2014. */
  statutoryRate: number;
  /** Reportable fringe benefits below this grossed-up value aren't reported. */
  reportingThreshold: number;
  /** Zero/low-emissions vehicles under the LCT fuel-efficient threshold, first
   *  held and used on or after this date, are exempt from FBT. */
  evExemption: {
    enabled: boolean;
    firstHeldFrom: string; // ISO date
    /** Plug-in hybrids stopped qualifying on this date (existing binding
     *  commitments continue). */
    phevEligibleUntil: string;
  };
}

export interface LeaseConfig {
  /** ATO minimum residual values (IT 2509), as a % of the amount financed,
   *  keyed by whole-year term. Financiers may set a higher residual. */
  residualMinPct: Record<string, number>;
  defaultTermYears: number;
  defaultInterestRatePct: number;
  /** Lease-management fee the financier folds into the salary deduction. */
  defaultAdminFeeAnnual: number;
  /** Establishment fee charged once at the start of the lease. */
  defaultEstablishmentFee: number;
  /** Pay cycles per year the deduction is spread over. */
  payCyclesPerYear: number;
}

export interface GstConfig {
  rate: number;
  /** Car limit — caps both the GST credit the financier can claim and the
   *  depreciation deduction. GST above this on the vehicle isn't recoverable. */
  carLimit: number;
}

export interface LctConfig {
  rate: number;
  thresholdFuelEfficient: number;
  thresholdOther: number;
}

/** Benchmark running costs, all EXCLUDING GST (a packaged running cost is paid
 *  by the employer, who claims the GST credit, so the employee budgets ex-GST). */
export interface RunningCostConfig {
  fuel: {
    /** Litres per 100km for a representative petrol vehicle. */
    litresPer100km: number;
    pricePerLitre: number;
    /** kWh per 100km for a battery-electric vehicle. */
    kwhPer100km: number;
    pricePerKwh: number;
  };
  servicing: {
    annualBase: number;
    perKm: number;
    /** EVs skip most scheduled servicing — multiplier on the petrol figure. */
    evMultiplier: number;
  };
  tyres: {
    setCost: number;
    kmPerSet: number;
  };
  /** Registration + CTP, annual. State-varying — the default is a national midpoint. */
  registrationAnnual: number;
  insurance: {
    /** Comprehensive premium as a % of vehicle value, with a floor. */
    pctOfValue: number;
    minAnnual: number;
  };
  roadsideAnnual: number;
}

export interface EngineConfig {
  financialYear: string;
  tax: TaxConfig;
  fbt: FbtConfig;
  gst: GstConfig;
  lct: LctConfig;
  lease: LeaseConfig;
  running: RunningCostConfig;
}

export const DEFAULT_CONFIG: EngineConfig = {
  financialYear: "2026-27",

  tax: {
    // FY2026-27 resident scale. The $18,201–$45,000 bracket is 15% from
    // 1 July 2026 (the legislated cost-of-living cut; 14% from 1 July 2027).
    // `base` = cumulative tax at the bottom of each bracket.
    brackets: [
      { upTo: 18_200, base: 0, rate: 0 },
      { upTo: 45_000, base: 0, rate: 0.15 },
      { upTo: 135_000, base: 4_020, rate: 0.3 },
      { upTo: 190_000, base: 31_020, rate: 0.37 },
      { upTo: Infinity, base: 51_370, rate: 0.45 },
    ],
    lito: {
      max: 700,
      fullUpTo: 37_500,
      firstTaperTo: 45_000,
      firstTaperRate: 0.05,
      secondTaperRate: 0.015,
    },
    medicare: { rate: 0.02, lowIncomeThreshold: 27_222, shadeInRate: 0.1 },
    // Marginal HELP scale (from 1 July 2025): nil to $67,000, then 15c/$ to
    // $125,000 and 17c/$ above.
    helpBands: [
      { upTo: 67_000, rate: 0 },
      { upTo: 125_000, rate: 0.15 },
      { upTo: Infinity, rate: 0.17 },
    ],
  },

  fbt: {
    rate: 0.47,
    grossUpType1: 2.0802,
    grossUpType2: 1.8868,
    statutoryRate: 0.2,
    reportingThreshold: 2_000,
    evExemption: {
      enabled: true,
      firstHeldFrom: "2022-07-01",
      phevEligibleUntil: "2025-04-01",
    },
  },

  gst: { rate: 0.1, carLimit: 69_674 },

  lct: { rate: 0.33, thresholdFuelEfficient: 91_387, thresholdOther: 80_567 },

  lease: {
    // ATO IT 2509 minimum residuals, by term.
    residualMinPct: {
      "1": 65.63,
      "2": 56.25,
      "3": 46.88,
      "4": 37.5,
      "5": 28.13,
    },
    defaultTermYears: 5,
    defaultInterestRatePct: 7.5,
    defaultAdminFeeAnnual: 550,
    defaultEstablishmentFee: 450,
    payCyclesPerYear: 26, // fortnightly
  },

  running: {
    fuel: {
      litresPer100km: 8.0,
      pricePerLitre: 1.85,
      kwhPer100km: 16.5,
      pricePerKwh: 0.28,
    },
    servicing: { annualBase: 420, perKm: 0.012, evMultiplier: 0.55 },
    tyres: { setCost: 900, kmPerSet: 45_000 },
    registrationAnnual: 880,
    insurance: { pctOfValue: 2.4, minAnnual: 900 },
    roadsideAnnual: 120,
  },
};

/** Backfill a stored config with code defaults for anything added since it was
 *  seeded, so a new parameter never reads as undefined in a live database.
 *
 *  Every top-level block is filled from the defaults if it is missing entirely —
 *  which also means a config left over from a DIFFERENT app pointed at the same
 *  database degrades to sensible defaults instead of crashing a render. Nested
 *  blocks added after the initial seed get their own explicit backfill below. */
export function withDefaults(data: EngineConfig): EngineConfig {
  let out = { ...DEFAULT_CONFIG, ...(data ?? {}) };
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof EngineConfig)[]) {
    if (out[key] == null) out = { ...out, [key]: DEFAULT_CONFIG[key] };
  }
  if (out.tax.helpBands == null) {
    out = { ...out, tax: { ...out.tax, helpBands: DEFAULT_CONFIG.tax.helpBands } };
  }
  if (out.tax.brackets == null) {
    out = { ...out, tax: { ...out.tax, brackets: DEFAULT_CONFIG.tax.brackets } };
  }
  if (out.fbt.evExemption == null) {
    out = { ...out, fbt: { ...out.fbt, evExemption: DEFAULT_CONFIG.fbt.evExemption } };
  }
  return out;
}

/** JSON has no Infinity — the top bracket round-trips through the database as
 *  null. Restore it when reading a stored config. */
export function reviveConfig(data: EngineConfig): EngineConfig {
  const brackets = data.tax?.brackets?.map((b) => ({
    ...b,
    upTo: b.upTo == null ? Infinity : b.upTo,
  }));
  const helpBands = data.tax?.helpBands?.map((b) => ({
    ...b,
    upTo: b.upTo == null ? Infinity : b.upTo,
  }));
  return withDefaults({
    ...data,
    tax: { ...data.tax, ...(brackets ? { brackets } : {}), ...(helpBands ? { helpBands } : {}) },
  });
}
