// The novated lease engine.
//
// A novated lease is a three-way agreement: the employee picks the car, a
// financier leases it, and the employer takes the payments out of the employee's
// salary. Everything interesting follows from WHERE in the pay packet those
// deductions come from:
//
//   • pre-tax  — reduces taxable income, so it costs the employee (1 − marginal
//                rate) of each dollar
//   • post-tax — the "employee contribution" that cancels FBT, costing a full
//                dollar per dollar
//
// FBT is what forces the split. Providing a car to an employee is a fringe
// benefit; under the statutory formula its taxable value is 20% of the car's
// base value each year. The employer must either pay FBT on that (grossed up,
// at 47% — expensive), or the employee can hand back a post-tax contribution
// equal to the taxable value, which reduces the FBT to nil. That's the Employee
// Contribution Method (ECM) and it is what nearly every lease uses.
//
// Eligible battery-electric vehicles under the luxury car tax threshold for
// fuel-efficient vehicles are FBT-EXEMPT, so no post-tax contribution is needed
// at all — the whole package comes out pre-tax. That exemption is the single
// biggest driver of the numbers this app explains.
//
// Everything is modelled in today's dollars: no indexation of salary, fuel or
// service costs across the term, so a saving shown is a saving in money the user
// recognises today.

import type { AuState, EngineConfig, RunningCostConfig } from "./config";
import { takeHome, marginalRelief, type TakeHome } from "./tax";

export type FbtMethod = "ecm" | "employer-pays";
export type FuelType = "petrol" | "diesel" | "electric" | "phev" | "hybrid";

/**
 * How often someone is paid.
 *
 * Presentation, not arithmetic: every figure the engine computes is annual,
 * and this decides how it is sliced. Fortnightly is the Australian default and
 * lives in the reference data, but plenty of people are paid weekly or
 * monthly, and "costs you $X a fortnight" is meaningless to them.
 */
export type PayCycle = "weekly" | "fortnightly" | "monthly";

export const PAY_CYCLES_PER_YEAR: Record<PayCycle, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

/** The cycle as a noun, for "costs you per ___". */
export const PAY_CYCLE_NOUN: Record<PayCycle, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};

/** The cycle as a label on a control. */
export const PAY_CYCLE_LABEL: Record<PayCycle, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

/** What the user chose, or whatever the reference data says is typical. */
export function effectivePayCycle(
  payCycle: PayCycle | undefined,
  config: EngineConfig,
): PayCycle {
  if (payCycle) return payCycle;
  const n = config.lease.payCyclesPerYear;
  return (
    (Object.keys(PAY_CYCLES_PER_YEAR) as PayCycle[]).find(
      (k) => PAY_CYCLES_PER_YEAR[k] === n,
    ) ?? "fortnightly"
  );
}

export interface LeaseInputs {
  /** Gross annual salary, before any packaging. */
  salary: number;
  /**
   * The CAR's cost price, GST included — the negotiated price plus dealer
   * delivery and anything fitted before handover.
   *
   * Not the drive-away figure: registration, stamp duty and CTP are excluded
   * by the ATO from the base value the FBT is worked out on, so they live in
   * `onRoadCosts` instead. Putting them here overstates the FBT on every
   * non-exempt car, by 20% of the on-roads every year.
   */
  vehiclePrice: number;
  /**
   * Stamp duty, registration, CTP and plates.
   *
   * Financed with the car on a normal novated lease, so they are repaid — but
   * they are not part of the FBT base value, the GST credit or the luxury car
   * tax tests. Omit when the employee pays them separately.
   */
  onRoadCosts?: number;
  fuelType: FuelType;
  termYears: number;
  annualKm: number;
  /** Financier's annual interest rate, as a percentage. */
  interestRatePct: number;
  /** Residual as a % of the financed amount. Defaults to the ATO minimum for
   *  the term — the lowest the ATO accepts, and what financiers usually quote. */
  residualPct?: number;
  /** Package the running costs (fuel, servicing, tyres, rego, insurance) into
   *  the lease as well, rather than paying for them yourself out of take-home. */
  includeRunningCosts: boolean;
  fbtMethod: FbtMethod;
  hasHelpDebt?: boolean;
  /** Override any modelled running cost with a real quote. */
  runningCostOverrides?: Partial<AnnualRunningCosts>;
  adminFeeAnnual?: number;
  establishmentFee?: number;
  /** Interest rate on the car loan the "buy it yourself" comparison uses. */
  comparisonLoanRatePct?: number;
  /** Where the car is registered. Registration and CTP vary materially by
   *  state; without one we use a national midpoint. */
  state?: AuState;
  /** How often the user is paid. Slices the annual figures for display;
   *  nothing in the calculation depends on it. Defaults to the reference
   *  data's typical cycle. */
  payCycle?: PayCycle;
  /** Catalogue vehicle, when the user picked one. Carries the image and, more
   *  usefully, this model's own consumption. */
  vehicleId?: string;
  /** This car's combined-cycle consumption, overriding the class default:
   *  litres per 100km, or kWh per 100km when electric. */
  consumptionPer100km?: number;
}

export interface AnnualRunningCosts {
  fuel: number;
  servicing: number;
  tyres: number;
  registration: number;
  insurance: number;
  roadside: number;
}

export interface RunningCostBreakdown extends AnnualRunningCosts {
  total: number;
}

export interface FbtOutcome {
  /** True when the car itself is exempt (eligible EV under the LCT threshold). */
  exempt: boolean;
  exemptReason: string | null;
  /** Base value the statutory formula runs on (GST-inclusive cost of the car). */
  baseValue: number;
  /** 20% of base value — the annual taxable value before contributions. */
  taxableValue: number;
  /** Post-tax contribution needed to reduce FBT to nil (ECM). */
  employeeContribution: number;
  /** FBT the employer is left to pay, grossed up. Passed on to the employee in
   *  the deduction when the method is "employer-pays". */
  fbtPayable: number;
  /** Grossed-up value shown on the employee's payment summary. Exempt EVs are
   *  still reportable, which matters for income-tested obligations. */
  reportableFringeBenefit: number;
}

export interface LeaseFinance {
  /** The car's GST-inclusive cost price — the FBT base value. */
  priceInclGst: number;
  /** Stamp duty, registration and the rest, where they are financed. */
  onRoadCosts: number;
  /** Car plus on-roads: the dealer's invoice total. */
  driveAwayTotal: number;
  /** GST the financier recovers, capped by the car limit. */
  gstCredit: number;
  /** What the lease is actually written over, after the GST credit. */
  amountFinanced: number;
  residual: number;
  residualPct: number;
  monthlyPayment: number;
  annualPayment: number;
  totalPayments: number;
  totalInterest: number;
  luxuryCarTax: number;
  /** Annual charge passed on for deductions lost above the car limit. */
  luxuryCarAdjustment: number;
}

export interface PackageBreakdown {
  /** Deducted before tax: lease payments, running costs and fees. */
  preTaxAnnual: number;
  /** Deducted after tax: the ECM contribution (nil for an exempt EV). */
  postTaxAnnual: number;
  /** Income tax + Medicare + HELP the pre-tax deduction avoids. */
  taxSaved: number;
  /** The blended rate the pre-tax dollars are relieved at. */
  effectiveReliefRate: number;
  /** True cost to the employee for the year: pre-tax cost after relief, plus
   *  the post-tax contribution in full. */
  netAnnualCost: number;
  /** Take-home pay before and after packaging. */
  takeHomeBefore: number;
  takeHomeAfter: number;
  takeHomeReduction: number;
}

export interface OwnershipComparison {
  /** Buying the same car with a car loan, from take-home pay. */
  loan: { annualRepayment: number; totalRepaid: number; totalCost: number };
  /** Buying it outright with cash. */
  cash: { upfront: number; totalCost: number };
  /** The lease, over the same term. */
  lease: { totalCost: number };
  /** Lease total cost less the cheaper of the two alternatives. Negative = the
   *  lease is cheaper. */
  savingVsLoan: number;
  savingVsCash: number;
}

export interface LeaseResult {
  inputs: LeaseInputs;
  finance: LeaseFinance;
  running: RunningCostBreakdown;
  fbt: FbtOutcome;
  package: PackageBreakdown;
  perPayCycle: { preTax: number; postTax: number; takeHomeReduction: number };
  /**
   * The two whole tax positions the relief was measured between.
   *
   * Surfaced so a payslip can be laid out from what the engine actually did
   * rather than recomputed alongside it — the "after" side carries the
   * reportable fringe benefit in its HELP repayment income, which a second
   * calculation would be unlikely to reproduce. `after.net` is before the
   * post-tax contribution comes out; that is the next line on the payslip.
   */
  payslip: { before: TakeHome; after: TakeHome };
  comparison: OwnershipComparison;
  /** Whole-of-term totals, residual excluded (it's a separate decision). */
  term: {
    years: number;
    netCost: number;
    taxSaved: number;
    gstSaved: number;
    residualPayable: number;
  };
  warnings: string[];
}

// --- Finance ---------------------------------------------------------------

/** Payment on an amortising loan that ends with a balloon (the residual). */
export function annuityPayment(
  principal: number,
  balloon: number,
  annualRatePct: number,
  months: number,
): number {
  const r = annualRatePct / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return (principal - balloon) / months;
  const growth = Math.pow(1 + r, months);
  // Standard annuity with a future value: the balloon is discounted back and
  // only the amortising remainder is spread across the term.
  return (principal * growth - balloon) * (r / (growth - 1));
}

/** One month of the lease, after that month's payment has been made. */
export interface AmortisationPoint {
  /** Months elapsed. 0 is the day the lease starts. */
  month: number;
  /** Still owing to the financier. Ends at the residual, not at zero. */
  balance: number;
  /** Interest charged so far, cumulatively. */
  interestPaid: number;
  /** How much of the debt has actually been retired so far. */
  principalPaid: number;
  /** Interest inside THIS month's payment. Zero at month 0. */
  interest: number;
  /** Debt retired by THIS month's payment. Zero at month 0. */
  principal: number;
}

/**
 * What is still owed, month by month.
 *
 * Worth plotting rather than describing, because the shape carries the two
 * facts people are most often surprised by. The line is not straight — early
 * payments are mostly interest, so the balance barely moves at first — and it
 * does not reach zero: it lands exactly on the residual, which is the lump
 * still owing on the last day.
 *
 * Starts at month 0 with nothing paid, so the first point is the amount
 * financed itself.
 */
export function amortisationSchedule(
  principal: number,
  balloon: number,
  annualRatePct: number,
  months: number,
): AmortisationPoint[] {
  const r = annualRatePct / 100 / 12;
  const payment = annuityPayment(principal, balloon, annualRatePct, months);
  const points: AmortisationPoint[] = [
    { month: 0, balance: principal, interestPaid: 0, principalPaid: 0, interest: 0, principal: 0 },
  ];

  let balance = principal;
  let interestPaid = 0;
  for (let m = 1; m <= months; m++) {
    const interest = balance * r;
    interestPaid += interest;
    balance = balance + interest - payment;
    const settled = m === months ? balloon : balance;
    points.push({
      month: m,
      // Floating point drift over 60 iterations is a few cents; the last
      // point is the residual by construction, so say so exactly.
      balance: settled,
      interestPaid,
      principalPaid: principal - settled,
      interest,
      // Derived from the balances rather than as payment − interest, so the
      // split always reconciles with the line drawn above it.
      principal: points[points.length - 1].balance - settled,
    });
  }
  return points;
}

/**
 * The inverse of {@link annuityPayment}: given what is being paid, recover the
 * interest rate behind it.
 *
 * This is the single most useful thing the app can do with a real lease quote.
 * Providers quote a monthly or fortnightly finance rental and, almost without
 * exception, no rate — but the rate is fully determined by the amount financed,
 * the residual, the term and the payment, so it can simply be solved for.
 *
 * Bisection rather than Newton: the payment rises monotonically with the rate,
 * so bisection cannot diverge or land on the wrong root, and 200 halvings over
 * the search window is exact to far more precision than the input warrants.
 *
 * Returns null when no rate explains the payment — a payment below the
 * interest-free floor means one of the inputs is wrong, and saying so is more
 * useful than returning a negative rate.
 */
export function impliedRate(
  principal: number,
  balloon: number,
  payment: number,
  months: number,
  opts: { min?: number; max?: number } = {},
): number | null {
  let lo = opts.min ?? -5;
  let hi = opts.max ?? 60;
  if (!(principal > 0) || !(payment > 0) || !(months > 0)) return null;
  if (balloon < 0 || balloon > principal) return null;
  // The interest-free floor IS explainable — it is exactly 0% — so compare with a
  // tolerance rather than rejecting the boundary case.
  if (payment < (principal - balloon) / months - 1e-6) return null;
  if (payment > annuityPayment(principal, balloon, hi, months)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (annuityPayment(principal, balloon, mid, months) < payment) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The charge a financier passes on for the deductions it loses above the car
 *  limit. Nil for a car under the limit. */
export function luxuryCarAdjustment(financed: number, config: EngineConfig): number {
  const excess = Math.max(0, financed - config.gst.carLimit);
  return excess * (config.lease.luxuryCarAdjustmentPct / 100);
}

/** Luxury car tax on a vehicle above the relevant threshold. LCT applies to the
 *  GST-inclusive value above the threshold, excluding the GST on that excess. */
export function luxuryCarTax(
  priceInclGst: number,
  fuelType: FuelType,
  config: EngineConfig,
): number {
  const fuelEfficient = fuelType === "electric" || fuelType === "phev" || fuelType === "hybrid";
  const threshold = fuelEfficient
    ? config.lct.thresholdFuelEfficient
    : config.lct.thresholdOther;
  if (priceInclGst <= threshold) return 0;
  const excess = priceInclGst - threshold;
  return (excess / (1 + config.gst.rate)) * config.lct.rate;
}

/**
 * The GST the financier recovers on the car, capped at the car limit.
 *
 * Exported because the price builder shows the same figure while the user is
 * still typing — and two copies of a capped calculation is exactly the kind
 * of thing that drifts apart.
 */
export function carGstCredit(carCost: number, config: EngineConfig): number {
  const creditable = Math.min(Math.max(0, carCost), config.gst.carLimit);
  return creditable - creditable / (1 + config.gst.rate);
}

export function buildFinance(
  inputs: LeaseInputs,
  config: EngineConfig,
): LeaseFinance {
  const price = Math.max(0, inputs.vehiclePrice);
  const onRoads = Math.max(0, inputs.onRoadCosts ?? 0);
  // The financier buys the car and claims the GST credit, but only up to the
  // car limit — GST on value above that is not recoverable and stays in the
  // amount financed. Measured on the CAR, not the drive-away total: the car
  // limit is a limit on the car.
  const gstCredit = carGstCredit(price, config);
  // On-roads are financed alongside the car and repaid with it. No GST credit
  // is taken on them here: registration and stamp duty carry no GST, and the
  // CTP component that does is small enough that claiming it would be a
  // bigger error than leaving it.
  const amountFinanced = price - gstCredit + onRoads;

  const residualPct =
    inputs.residualPct ?? config.lease.residualMinPct[String(inputs.termYears)] ?? 0;
  const residual = amountFinanced * (residualPct / 100);
  const months = inputs.termYears * 12;
  const monthlyPayment = annuityPayment(
    amountFinanced,
    residual,
    inputs.interestRatePct,
    months,
  );
  const totalPayments = monthlyPayment * months;

  return {
    priceInclGst: price,
    onRoadCosts: onRoads,
    driveAwayTotal: price + onRoads,
    gstCredit,
    amountFinanced,
    residual,
    residualPct,
    monthlyPayment,
    annualPayment: monthlyPayment * 12,
    totalPayments,
    totalInterest: totalPayments + residual - amountFinanced,
    luxuryCarTax: luxuryCarTax(price, inputs.fuelType, config),
    luxuryCarAdjustment: luxuryCarAdjustment(amountFinanced, config),
  };
}

// --- Running costs ---------------------------------------------------------

/** Modelled annual running costs, ex-GST, for a car of this value doing this
 *  many kilometres. Any component the user has a real quote for is overridden. */
export function buildRunningCosts(
  inputs: LeaseInputs,
  config: EngineConfig,
): RunningCostBreakdown {
  const r: RunningCostConfig = config.running;
  const km = Math.max(0, inputs.annualKm);
  const electric = inputs.fuelType === "electric";

  // A specific model's own figure beats the class average when we have it.
  const kwhPer100 = electric ? (inputs.consumptionPer100km ?? r.fuel.kwhPer100km) : r.fuel.kwhPer100km;
  const litresPer100 = electric ? r.fuel.litresPer100km : (inputs.consumptionPer100km ?? r.fuel.litresPer100km);

  const energy = electric
    ? (km / 100) * kwhPer100 * r.fuel.pricePerKwh
    : (km / 100) * litresPer100 * r.fuel.pricePerLitre;
  // PHEVs run on both — split the difference rather than pretend either extreme.
  const fuel =
    inputs.fuelType === "phev"
      ? ((km / 100) * litresPer100 * r.fuel.pricePerLitre) * 0.45 +
        ((km / 100) * r.fuel.kwhPer100km * r.fuel.pricePerKwh) * 0.55
      : inputs.fuelType === "hybrid"
        ? energy * 0.72
        : energy;

  const servicingFull = r.servicing.annualBase + km * r.servicing.perKm;
  const servicing = electric ? servicingFull * r.servicing.evMultiplier : servicingFull;
  const tyres = (km / r.tyres.kmPerSet) * r.tyres.setCost;
  const insurance = Math.max(
    r.insurance.minAnnual,
    inputs.vehiclePrice * (r.insurance.pctOfValue / 100),
  );

  const exGst = (x: number) => x / (1 + config.gst.rate);

  const modelled: AnnualRunningCosts = {
    // Registration is largely GST-free (the CTP component carries GST, but the
    // registration fee itself doesn't) — budget it as-is.
    registration:
      (inputs.state && r.registrationByState?.[inputs.state]) || r.registrationAnnual,
    fuel: exGst(fuel),
    servicing: exGst(servicing),
    tyres: exGst(tyres),
    insurance: exGst(insurance),
    roadside: exGst(r.roadsideAnnual),
  };

  const merged = { ...modelled, ...(inputs.runningCostOverrides ?? {}) };
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  return { ...merged, total };
}

// --- FBT -------------------------------------------------------------------

export function assessFbt(
  inputs: LeaseInputs,
  finance: LeaseFinance,
  config: EngineConfig,
): FbtOutcome {
  // Base value is the GST-INCLUSIVE cost of the car to the provider (the LCT is
  // included; on-road costs like registration and stamp duty are not).
  const baseValue = finance.priceInclGst;
  const taxableValue = baseValue * config.fbt.statutoryRate;

  const evExempt =
    config.fbt.evExemption.enabled &&
    inputs.fuelType === "electric" &&
    inputs.vehiclePrice <= config.lct.thresholdFuelEfficient;

  if (evExempt) {
    return {
      exempt: true,
      exemptReason:
        "Battery-electric vehicle under the luxury car tax threshold for fuel-efficient vehicles — exempt from FBT.",
      baseValue,
      taxableValue,
      employeeContribution: 0,
      fbtPayable: 0,
      // An exempt car benefit is still a reportable fringe benefit: it doesn't
      // add to taxable income, but it counts towards income tests (Medicare levy
      // surcharge, HELP repayment income, family assistance).
      reportableFringeBenefit: taxableValue * config.fbt.grossUpType2,
    };
  }

  if (inputs.fbtMethod === "ecm") {
    return {
      exempt: false,
      exemptReason: null,
      baseValue,
      taxableValue,
      employeeContribution: taxableValue,
      fbtPayable: 0,
      reportableFringeBenefit: 0, // contributions reduce the taxable value to nil
    };
  }

  const fbtPayable = taxableValue * config.fbt.grossUpType1 * config.fbt.rate;
  return {
    exempt: false,
    exemptReason: null,
    baseValue,
    taxableValue,
    employeeContribution: 0,
    fbtPayable,
    reportableFringeBenefit: taxableValue * config.fbt.grossUpType2,
  };
}

// --- The package -----------------------------------------------------------

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function calculateLease(
  inputs: LeaseInputs,
  config: EngineConfig,
): LeaseResult {
  const warnings: string[] = [];
  const finance = buildFinance(inputs, config);
  const running = buildRunningCosts(inputs, config);
  const fbt = assessFbt(inputs, finance, config);

  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;
  const runningInPackage = inputs.includeRunningCosts ? running.total : 0;

  // Everything the employer deducts, before deciding pre- vs post-tax.
  const packagedTotal =
    finance.annualPayment +
    runningInPackage +
    adminFee +
    finance.luxuryCarAdjustment +
    fbt.fbtPayable;
  // The employee contribution can't exceed the package it is paid out of — on a
  // very expensive car the statutory taxable value can otherwise run past the
  // whole year's cost, which no provider would actually deduct.
  const postTaxAnnual = Math.min(fbt.employeeContribution, packagedTotal);
  const preTaxAnnual = Math.max(0, packagedTotal - postTaxAnnual);

  // The relief is measured as the real difference the deduction makes, with the
  // reportable fringe benefit applied only to the packaged side: it doesn't
  // exist before the lease does, and it pushes HELP repayment income UP, so
  // applying it to both sides would invent a saving nobody gets.
  const relief = marginalRelief(
    inputs.salary,
    preTaxAnnual,
    config,
    { hasHelpDebt: inputs.hasHelpDebt },
    { hasHelpDebt: inputs.hasHelpDebt, repaymentIncomeExtra: fbt.reportableFringeBenefit },
  );

  const before: TakeHome = relief.before;
  const after: TakeHome = relief.after;
  const takeHomeAfter = after.net - postTaxAnnual;

  // What the car actually costs once the tax relief is counted. Running costs
  // paid outside the package still have to be paid, so they're added back to
  // keep the comparison honest.
  const outOfPackageRunning = inputs.includeRunningCosts ? 0 : running.total;
  const netAnnualCost =
    preTaxAnnual - relief.taxSaved + postTaxAnnual + outOfPackageRunning;

  const pkg: PackageBreakdown = {
    preTaxAnnual,
    postTaxAnnual,
    taxSaved: relief.taxSaved,
    effectiveReliefRate: relief.effectiveRate,
    netAnnualCost,
    takeHomeBefore: before.net,
    takeHomeAfter,
    takeHomeReduction: before.net - takeHomeAfter,
  };

  const cycles = PAY_CYCLES_PER_YEAR[effectivePayCycle(inputs.payCycle, config)];
  const comparison = compareOwnership(inputs, finance, running, netAnnualCost, config);

  // --- Sanity checks the UI surfaces as plain-English warnings ---
  if (finance.luxuryCarTax > 0) {
    warnings.push(
      `This car is over the luxury car tax threshold, so roughly ${fmt(finance.luxuryCarTax)} of the price you pay is luxury car tax. The GST credit is also capped at the car limit, so not all of the GST comes back.`,
    );
  }
  if (finance.luxuryCarAdjustment > 0) {
    warnings.push(
      `Because the financed amount is above the ${fmt(config.gst.carLimit)} car limit, the financier can't claim full depreciation or GST credits on the excess and passes that cost on — about ${fmt(finance.luxuryCarAdjustment)} a year here, often shown on a quote as a "luxury car charge" or "luxury car adjustment".`,
    );
  }
  if (inputs.fuelType === "phev" && config.fbt.evExemption.enabled) {
    warnings.push(
      "Plug-in hybrids stopped qualifying for the FBT exemption on 1 April 2025 unless a binding commitment was already in place.",
    );
  }
  if (inputs.fuelType === "electric" && inputs.vehiclePrice > config.lct.thresholdFuelEfficient) {
    warnings.push(
      "This EV is above the luxury car tax threshold for fuel-efficient vehicles, so the FBT exemption does not apply.",
    );
  }
  if (pkg.takeHomeAfter < 0) {
    warnings.push("The package costs more than your take-home pay — the deductions can't be made.");
  }
  if (inputs.salary > 0 && preTaxAnnual > inputs.salary * 0.5) {
    warnings.push(
      "The pre-tax deduction is over half your salary. Most employers cap packaging well below this.",
    );
  }
  if (fbt.reportableFringeBenefit > config.fbt.reportingThreshold) {
    warnings.push(
      "This lease creates a reportable fringe benefit on your payment summary. It isn't taxable income, but it counts towards income tests such as the Medicare levy surcharge, child support and family assistance.",
    );
  }
  if (inputs.hasHelpDebt && fbt.reportableFringeBenefit > config.fbt.reportingThreshold) {
    warnings.push(
      "Because the reportable fringe benefit is added to your HELP repayment income, your compulsory study-loan repayment can rise even though your taxable income falls — which eats into the saving shown here.",
    );
  }

  return {
    inputs,
    finance,
    running,
    fbt,
    package: pkg,
    perPayCycle: {
      preTax: preTaxAnnual / cycles,
      postTax: postTaxAnnual / cycles,
      takeHomeReduction: pkg.takeHomeReduction / cycles,
    },
    payslip: { before, after },
    comparison,
    term: {
      years: inputs.termYears,
      netCost: netAnnualCost * inputs.termYears + (inputs.establishmentFee ?? config.lease.defaultEstablishmentFee),
      taxSaved: relief.taxSaved * inputs.termYears,
      gstSaved:
        finance.gstCredit +
        (inputs.includeRunningCosts
          ? running.total * config.gst.rate * inputs.termYears
          : 0),
      residualPayable: finance.residual,
    },
    warnings,
  };
}

/** The two alternatives a novated lease is normally weighed against, over the
 *  same term and with the same running costs, so only the funding differs. */
export function compareOwnership(
  inputs: LeaseInputs,
  finance: LeaseFinance,
  running: RunningCostBreakdown,
  leaseNetAnnualCost: number,
  config: EngineConfig,
): OwnershipComparison {
  const years = inputs.termYears;
  // Buying privately means paying the GST — no credit — and paying from
  // take-home pay, so running costs carry GST too.
  const priceInclGst = finance.priceInclGst;
  const runningInclGst = running.total * (1 + config.gst.rate);

  const loanRate = inputs.comparisonLoanRatePct ?? inputs.interestRatePct + 1.5;
  // Same balloon as the lease residual, so the two are compared like for like:
  // both leave the buyer holding the car with the same amount still owing.
  const monthly = annuityPayment(priceInclGst, finance.residual, loanRate, years * 12);
  const totalRepaid = monthly * years * 12;

  const loanTotal = totalRepaid + runningInclGst * years;
  const cashTotal = priceInclGst + runningInclGst * years;
  const leaseTotal = leaseNetAnnualCost * years;

  return {
    loan: { annualRepayment: monthly * 12, totalRepaid, totalCost: loanTotal },
    cash: { upfront: priceInclGst, totalCost: cashTotal },
    lease: { totalCost: leaseTotal },
    savingVsLoan: loanTotal - leaseTotal,
    savingVsCash: cashTotal - leaseTotal,
  };
}

/** Sensible starting inputs for someone who has just landed on the calculator. */
export function defaultInputs(config: EngineConfig): LeaseInputs {
  return {
    salary: 110_000,
    vehiclePrice: 55_000,
    fuelType: "electric",
    termYears: config.lease.defaultTermYears,
    annualKm: 15_000,
    interestRatePct: config.lease.defaultInterestRatePct,
    includeRunningCosts: true,
    fbtMethod: "ecm",
    hasHelpDebt: false,
  };
}
