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

import type { EngineConfig, RunningCostConfig } from "./config";
import { takeHome, marginalRelief, type TakeHome } from "./tax";

export type FbtMethod = "ecm" | "employer-pays";
export type FuelType = "petrol" | "diesel" | "electric" | "phev" | "hybrid";

export interface LeaseInputs {
  /** Gross annual salary, before any packaging. */
  salary: number;
  /** Advertised drive-away price, GST included. */
  vehiclePrice: number;
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
  /** GST-inclusive price the employee sees advertised. */
  priceInclGst: number;
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

export function buildFinance(
  inputs: LeaseInputs,
  config: EngineConfig,
): LeaseFinance {
  const price = Math.max(0, inputs.vehiclePrice);
  // The financier buys the car and claims the GST credit, but only up to the
  // car limit — GST on value above that is not recoverable and stays in the
  // amount financed.
  const creditableValue = Math.min(price, config.gst.carLimit);
  const gstCredit = creditableValue - creditableValue / (1 + config.gst.rate);
  const amountFinanced = price - gstCredit;

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
    gstCredit,
    amountFinanced,
    residual,
    residualPct,
    monthlyPayment,
    annualPayment: monthlyPayment * 12,
    totalPayments,
    totalInterest: totalPayments + residual - amountFinanced,
    luxuryCarTax: luxuryCarTax(price, inputs.fuelType, config),
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

  const energy = electric
    ? (km / 100) * r.fuel.kwhPer100km * r.fuel.pricePerKwh
    : (km / 100) * r.fuel.litresPer100km * r.fuel.pricePerLitre;
  // PHEVs run on both — split the difference rather than pretend either extreme.
  const fuel =
    inputs.fuelType === "phev"
      ? ((km / 100) * r.fuel.litresPer100km * r.fuel.pricePerLitre) * 0.45 +
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
    registration: r.registrationAnnual,
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
    finance.annualPayment + runningInPackage + adminFee + fbt.fbtPayable;
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

  const cycles = config.lease.payCyclesPerYear;
  const comparison = compareOwnership(inputs, finance, running, netAnnualCost, config);

  // --- Sanity checks the UI surfaces as plain-English warnings ---
  if (finance.luxuryCarTax > 0) {
    warnings.push(
      `This car is over the luxury car tax threshold, so roughly ${Math.round(finance.luxuryCarTax).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })} of the price you pay is luxury car tax. The GST credit is also capped at the car limit, so not all of the GST comes back.`,
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
