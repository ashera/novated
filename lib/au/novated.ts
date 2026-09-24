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

import type { AuState, EngineConfig, EvPhase, RunningCostConfig } from "./config";
import { takeHome, marginalRelief, type TakeHome } from "./tax";

export type FbtMethod = "ecm" | "employer-pays";

/**
 * Whether the employer pays FBT like everyone else, or is capped.
 *
 * "hospital" covers public and non-profit hospitals and public ambulance
 * services; "pbi" covers public benevolent institutions and health promotion
 * charities; "rebatable" covers the other non-profits, which pay the tax and
 * get part of it back rather than being exempt.
 */
export type EmployerFbtStatus = "ordinary" | "hospital" | "pbi" | "rebatable";

export const CAPPED_EMPLOYERS = ["hospital", "pbi", "rebatable"] as const;

export function isCappedEmployer(s: EmployerFbtStatus | undefined): boolean {
  return s != null && s !== "ordinary";
}

/**
 * What the cap is worth in the money people actually talk about.
 *
 * The legislated figure is grossed up; the number on a packaging provider's
 * brochure is that divided by the type 2 factor — $9,010 and $15,900. Both
 * refer to the same cap and quoting the wrong one at somebody is how this
 * gets confusing, so the conversion lives in one place.
 */
export function capSpendable(grossedUpCap: number, config: EngineConfig): number {
  return grossedUpCap / config.fbt.grossUpType2;
}

export function capFor(status: EmployerFbtStatus, config: EngineConfig): number {
  return status === "ordinary" ? 0 : config.fbt.cappedEmployers.grossedUpCap[status];
}
export type FuelType = "petrol" | "diesel" | "electric" | "phev" | "hybrid";

/**
 * How old the car is when the lease starts.
 *
 * Not cosmetic: it decides whether the FBT exemption can apply at all (the
 * car must have been first held and used on or after the start date), which
 * threshold its price is tested against, and whether the running-cost
 * benchmarks — modelled on a car in warranty — are the right ones.
 *
 * "demo" is its own answer rather than a flavour of used, because a
 * demonstrator has been registered, which is what the date test cares about,
 * but is usually months rather than years old.
 */
export type CarCondition = "new" | "demo" | "used";

/** Who sells the car to the financier. A licensed dealer's price includes GST
 *  the financier reclaims; a private seller's does not. */
export type PurchaseChannel = "dealer" | "private";

/** True where the car has been registered to somebody before this lease. */
export function isPreOwned(condition: CarCondition | undefined): boolean {
  return condition === "used" || condition === "demo";
}

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
  /** Ordinary unless they work somewhere with an FBT cap. */
  employerFbtStatus?: EmployerFbtStatus;
  /** What they already package each year against the cap, in spendable
   *  dollars — mortgage, rent, everyday living expenses. Most people who have
   *  a cap have already spent it, which is why it is asked rather than
   *  assumed either way. */
  capUsedSpendable?: number;
  hasHelpDebt?: boolean;
  /** Override any modelled running cost with a real quote. */
  runningCostOverrides?: Partial<AnnualRunningCosts>;
  adminFeeAnnual?: number;
  establishmentFee?: number;
  /** Interest rate on the car loan the "buy it yourself" comparison uses. */
  comparisonLoanRatePct?: number;
  /**
   * What the money would earn if it weren't spent on a car, per year.
   *
   * Only the cash column uses it. Defaults to the reference data's figure;
   * set it to zero for somebody whose alternative really is a transaction
   * account earning nothing.
   */
  opportunityRatePct?: number;
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

  /**
   * New, ex-demo, or second-hand. Absent means new — which is what every
   * lease saved before we asked was implicitly modelled as, so the default
   * has to keep those figures exactly where they were.
   */
  condition?: CarCondition;
  /**
   * When the car was first registered, as an ISO date.
   *
   * The exemption turns on when the car was first held and used by ANYBODY,
   * not on when this driver gets it — a car first used before the start date
   * can never become exempt, however many times it changes hands. Only
   * meaningful when the car isn't new.
   */
  firstRegisteredDate?: string;
  /** What it sold for when it was new, where the buyer of a used car knows.
   *  The exemption's price cap is tested at the first retail sale, not at
   *  this sale, so without it that half of the test can't be run. */
  firstRetailPrice?: number;
  /** Who the financier buys it from. A private seller charges no GST, so
   *  there is no credit to claim and the whole price is financed. */
  purchasedFrom?: PurchaseChannel;
  /**
   * When the lease itself commences.
   *
   * Which phase of the electric car concession the arrangement is locked into
   * for its life, and nothing else. Absent, the engine assumes the config's
   * own financial year, which is what modelling a lease today means — and
   * which leaves every lease saved before we asked answering as it did.
   */
  commencementDate?: string;
  /**
   * Whether the employer calculates super on salary BEFORE the sacrifice.
   *
   * They are not obliged to — a car sacrifice lawfully reduces the earnings
   * the guarantee is worked out on — but some employment agreements say they
   * will, and it is worth thousands over a lease. Absent means they don't,
   * which is both the default position and the one that costs the employee.
   */
  employerPaysSuperOnPreSacrifice?: boolean;
  /**
   * The share of the tax saving the employer keeps, as a percentage.
   *
   * Common in public health, ambulance services and universities, where the
   * packaging is run as a scheme and the employer takes half the benefit it
   * creates. It appears on a payslip as a second pre-tax line beside the
   * lease — "Share of Saving" — and nowhere in a provider's headline figures,
   * which quote what the employee keeps without saying that it is a half.
   *
   * Absent or zero means the employee keeps the lot: the ordinary
   * private-sector arrangement, and what every scenario saved before this
   * existed was modelled as.
   */
  employerSavingSharePct?: number;
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
  /** Set for an employee of a capped employer — how their cap absorbed the car. */
  cap?: CapOutcome;
}

/**
 * How a capped employer's annual ceiling absorbed this car.
 *
 * The point of modelling it: within the cap there is no FBT to cancel, so
 * there is nothing for an employee contribution to do. Post-tax dollars get no
 * relief at all, so paying them to cancel a tax that was never going to be
 * charged is a pure loss — and that is what this site would have told a
 * hospital employee to do before this existed.
 */
export interface CapOutcome {
  status: EmployerFbtStatus;
  /** Legislated grossed-up ceiling for this kind of employer. */
  grossedUpCap: number;
  /** Grossed-up value already used on other packaging this FBT year. */
  used: number;
  /** Grossed-up room left before the car is counted. */
  available: number;
  /** Grossed-up value of the car benefit. */
  carGrossedUp: number;
  /** The part of the car that fitted inside the cap. */
  sheltered: number;
  /** The part that did not, and is taxed or contributed against as usual. */
  excess: number;
  /** True when the whole car fitted — no contribution and no FBT at all. */
  fullyCovered: boolean;
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
  /** Income tax + Medicare + HELP the pre-tax deduction avoids.
   *
   *  The whole relief, before any employer share is taken out of it — this is
   *  tax that is genuinely not paid. Who ends up with it is `employerShare`. */
  taxSaved: number;
  /**
   * The slice of that saving the employer keeps, as a second pre-tax
   * deduction. Zero for everybody without such an arrangement.
   *
   * Reported rather than netted off `taxSaved`, because the two facts are
   * different and a reader is entitled to both: this much tax was avoided,
   * and this much of it went somewhere other than your pocket.
   */
  employerShare: number;
  /**
   * What that share actually costs you, which is less than the employer gets.
   *
   * The share is deducted before tax, so it relieves tax of its own. The
   * employer receives the whole of `employerShare`; your take-home falls by
   * this, and the difference is tax the ATO no longer collects. On the default
   * example a 50% share hands the employer $2,578 a year and costs the
   * employee $1,753 — the other $825 is not paid by anybody.
   *
   * Both numbers are reported because quoting only the larger one overstates
   * what a reader loses, and this site does not get to do that in either
   * direction.
   */
  employerShareNetCost: number;
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
  /**
   * Buying the same car with a car loan, from take-home pay.
   *
   * Written over the drive-away total, the same money the lease borrows, and
   * ending on the same residual — so the two differ in how they are funded and
   * taxed, and in nothing else.
   *
   * `ratePct` is the rate actually used, carried on the result so the pages
   * that name it read it rather than re-deriving it. Three of them used to
   * hold their own copy of the formula.
   */
  loan: { ratePct: number; annualRepayment: number; totalRepaid: number; totalCost: number };
  /**
   * Buying it outright with cash.
   *
   * `upfront` is the drive-away figure, not the car's price: a cash buyer pays
   * the same stamp duty, registration and CTP the lease finances, and leaving
   * them out was worth more than everything else wrong with this comparison
   * put together.
   *
   * `foregone` is what that money would have earned had it stayed where it
   * was — the part of a cash purchase nobody counts, and the reason the cash
   * column used to look cheaper than it is.
   */
  cash: { upfront: number; foregone: number; totalCost: number };
  /** The lease, over the same term. */
  lease: { totalCost: number };
  /** The residual, which lease and loan both still owe and cash does not.
   *  Added to both so all three columns end in the same place. */
  residualSettled: number;
  /**
   * GST on the lease's buyout, which only the lease pays.
   *
   * The financier owns the car for the whole term; taking it at the end is a
   * purchase, and a purchase attracts GST. The loan and cash buyers owned it
   * from the start and paid their GST in the price, so this is the lease's
   * alone — and it is the back half of the GST credit the lease claimed up
   * front. Leaving it out granted the credit on the whole car and charged for
   * none of it back.
   */
  residualGstOnBuyout: number;
  /** Lease total cost less the cheaper of the two alternatives. Negative = the
   *  lease is cheaper. */
  savingVsLoan: number;
  savingVsCash: number;
}

/**
 * What the lease does to the employer's super contributions.
 *
 * `forgone` is not cash and must never be added to a cash total. It is
 * contributions that are never made: money that would have gone into super,
 * taxed at 15% on the way in and locked up until preservation age. Worth less
 * than the same number in the hand today, worth more after decades of
 * compounding, and worth nothing at all to somebody already above the
 * contribution base. Presented on its own, never folded into net cost.
 */
export interface SuperOutcome {
  /** Guarantee payable with no lease. */
  before: number;
  /** Guarantee payable once the pre-tax deduction reduces the earnings. */
  after: number;
  /** The contributions never made. Zero when the employer pays on
   *  pre-sacrifice salary, or when the earnings ceiling absorbs it. */
  forgone: number;
  /** True when the maximum contribution base is doing the work — the salary
   *  is high enough that reducing it changes nothing. */
  cappedOut: boolean;
  /** True when the employer has agreed to pay on pre-sacrifice salary. */
  protectedByAgreement: boolean;
}

/**
 * Super before and after the sacrifice.
 *
 * The ceiling is why this is not the rate times the deduction. Above the
 * maximum contribution base no guarantee is owed at all, so someone on
 * $400,000 can sacrifice twenty thousand and lose nothing, and someone just
 * above the line loses only the part that drops them under it.
 */
export function assessSuper(
  salary: number,
  preTaxAnnual: number,
  inputs: Pick<LeaseInputs, "employerPaysSuperOnPreSacrifice">,
  config: EngineConfig,
): SuperOutcome {
  const rate = config.super.guaranteeRatePct / 100;
  const cap = config.super.maxContributionBase;
  // Earnings above the ceiling attract nothing, so both sides clamp to it.
  const guaranteeOn = (earnings: number) => Math.max(0, Math.min(earnings, cap)) * rate;

  const before = guaranteeOn(salary);
  const protectedByAgreement = inputs.employerPaysSuperOnPreSacrifice === true;
  const after = protectedByAgreement ? before : guaranteeOn(salary - preTaxAnnual);
  return {
    before,
    after,
    forgone: Math.max(0, before - after),
    cappedOut: !protectedByAgreement && salary - preTaxAnnual >= cap,
    protectedByAgreement,
  };
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
  /** What the arrangement does to employer super. Deliberately NOT part of
   *  any cash total — see SuperOutcome. */
  superannuation: SuperOutcome;
  comparison: OwnershipComparison;
  /** Whole-of-term totals, residual excluded (it's a separate decision). */
  term: {
    years: number;
    netCost: number;
    taxSaved: number;
    /** Of that saving, what the employer kept over the whole term. */
    employerShare: number;
    /** What that cost the employee over the whole term, after the relief the
     *  share itself creates. Always less than `employerShare`. */
    employerShareNetCost: number;
    /** Net of the GST paid on buying the residual back. */
    gstSaved: number;
    /** Including the GST due on the buyout — what has to be found on the day. */
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
  //
  // Unless there is no GST to claim. A private seller isn't registered and
  // doesn't charge it, so nothing comes off the price and the financier writes
  // the lease over the whole thing — about a ninth more than the same car from
  // a dealer, on every payment.
  const gstCredit =
    inputs.purchasedFrom === "private" ? 0 : carGstCredit(price, config);
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

/**
 * The Australian financial year a date falls in, as "2024-25".
 *
 * Not the FBT year (see fbtYear.ts) — the LCT thresholds are published per
 * financial year, and this is only ever used to look one of them up.
 */
export function financialYearOf(date: Date): string {
  const y = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? y : y - 1; // July onwards is the new year
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * The fuel-efficient LCT threshold that applied when a car was first sold.
 *
 * Returns null where we hold no figure for that year, which the caller has to
 * treat as "couldn't check" rather than as a pass — quietly falling back to
 * today's threshold would exempt a car that was over the line when it was new,
 * and today's is the highest it has ever been.
 */
export function fuelEfficientThresholdFor(
  firstRetailDate: string | Date,
  config: EngineConfig,
): number | null {
  const d = firstRetailDate instanceof Date
    ? firstRetailDate
    : new Date(`${firstRetailDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return config.lct.thresholdFuelEfficientByYear[financialYearOf(d)] ?? null;
}

/** Just enough about a car to settle the exemption — a subset of LeaseInputs,
 *  so the vehicle card can ask without assembling a whole scenario. */
export interface ExemptionFacts {
  fuelType: FuelType;
  /** The car's cost price to this buyer. For a new car this IS the first
   *  retail sale, which is what the price cap is tested on. */
  vehiclePrice: number;
  condition?: CarCondition;
  firstRegisteredDate?: string;
  firstRetailPrice?: number;
  /**
   * When the novated lease itself commences.
   *
   * Not a fact about the car: this decides WHICH set of rules the arrangement
   * is grandfathered into, now that the concession is a schedule rather than a
   * permanent exemption. Absent, we assume it commences in the config's own
   * financial year — which is what somebody modelling a lease today is doing,
   * and which keeps every lease saved before we asked answering as it did.
   */
  commencementDate?: string;
}

export interface FbtExemptionCheck {
  /** True only when no FBT is payable at all — a nil statutory rate. */
  exempt: boolean;
  /**
   * The statutory percentage to apply to this car's base value.
   *
   * The whole concession expressed as one number, because that is how the law
   * delivers it: nil is the full exemption, 15% is the 25% discount, and the
   * standard rate is no concession at all. A boolean could not express the
   * middle band, and from April 2027 the middle band is where most electric
   * cars worth leasing will sit.
   */
  statutoryRate: number;
  /** What the concession takes off the FBT, as a fraction. 0 when none. */
  discount: number;
  /** Why it is not exempt, in a sentence — null when it is. */
  blockedBy: string | null;
  /**
   * Exempt on everything we could check, but something we couldn't.
   *
   * Its own state rather than a quiet pass, because the honest answer to "was
   * this car under the threshold when it was new" is often "we don't know",
   * and a green badge that means "probably" has to say so.
   */
  unverified: string | null;
  /** The phase that decided it, so the interface can say which rules a lease
   *  is locked into. */
  phaseFrom: string | null;
}

/** The start of an Australian financial year labelled like "2026-27". */
function financialYearStart(label: string): Date {
  const year = Number(label.slice(0, 4));
  return new Date(Date.UTC(Number.isFinite(year) ? year : 1970, 6, 1));
}

/**
 * Which phase of the electric car concession an arrangement falls under.
 *
 * Fixed at commencement and then followed for the life of the lease, so a car
 * leased today keeps today's treatment even once the rules move under it.
 * That is the actual law, and it is also why the commencement date stopped
 * being an optional nicety the moment the Budget passed.
 */
function evPhaseFor(commencement: Date, config: EngineConfig): EvPhase | null {
  let found: EvPhase | null = null;
  for (const phase of config.fbt.evExemption.phases ?? []) {
    if (commencement >= new Date(`${phase.from}T00:00:00Z`)) found = phase;
  }
  return found;
}

/**
 * How this car is treated for FBT.
 *
 * Kept out of {@link assessFbt} because the treatment is a fact about the car
 * and the day it is leased, not about a particular salary or term, and the
 * interface needs to say so next to the car — a whole assessment is a lot of
 * machinery to run to put a badge on a picture, and running it twice is how
 * the badge and the numbers end up disagreeing.
 *
 * Four conditions, and all of them bite:
 *
 *   - battery-electric only. A plug-in hybrid lost eligibility on 1 April 2025
 *     and a conventional hybrid never had it.
 *   - first held and used on or after 1 July 2022. This is about the CAR, not
 *     about this driver: a car somebody was driving in 2021 can never become
 *     exempt, however many times it is sold afterwards.
 *   - at or under the luxury car tax threshold for fuel-efficient vehicles at
 *     its FIRST retail sale — the threshold of that year, not this one. For a
 *     used car both halves of that test are historical, so it needs what the
 *     car sold for new, which the buyer may simply not know.
 *   - and which phase of the concession the lease commences in. From 1 April
 *     2027 the full exemption only reaches cars at or under $75,000; above
 *     that the FBT is discounted rather than removed, and from 1 April 2029
 *     the discount is all there is.
 */
export function checkFbtExemption(f: ExemptionFacts, config: EngineConfig): FbtExemptionCheck {
  const standard = config.fbt.statutoryRate;
  const no = (blockedBy: string): FbtExemptionCheck => ({
    exempt: false,
    statutoryRate: standard,
    discount: 0,
    blockedBy,
    unverified: null,
    phaseFrom: null,
  });
  const ev = config.fbt.evExemption;
  if (!ev.enabled) return no("The electric vehicle exemption isn't in force.");
  if (f.fuelType === "phev") {
    return no(
      `Plug-in hybrids stopped qualifying on ${ev.phevEligibleUntil}, unless the commitment was already binding.`,
    );
  }
  if (f.fuelType !== "electric") return no("Only battery-electric cars are exempt.");

  const preOwned = isPreOwned(f.condition);
  let unverified: string | null = null;
  // The price the cap is measured on, and the threshold it is measured against.
  let testPrice = f.vehiclePrice;
  let threshold = config.lct.thresholdFuelEfficient;

  if (preOwned) {
    if (!f.firstRegisteredDate) {
      return no(
        "We need the date it was first registered: the exemption only covers cars first held and used from " +
          `${ev.firstHeldFrom}, and that is about the car rather than about you.`,
      );
    }
    const registered = new Date(`${f.firstRegisteredDate}T00:00:00Z`);
    if (Number.isNaN(registered.getTime())) {
      return no("We couldn't read the date it was first registered.");
    }
    if (registered < new Date(`${ev.firstHeldFrom}T00:00:00Z`)) {
      return no(
        `It was first registered on ${f.firstRegisteredDate}, before the exemption started on ${ev.firstHeldFrom}. That is fixed to the car, so no later owner can claim it.`,
      );
    }
    const thenThreshold = fuelEfficientThresholdFor(registered, config);
    if (f.firstRetailPrice == null || thenThreshold == null) {
      unverified =
        f.firstRetailPrice == null
          ? "The price cap is measured on what the car sold for new, which we don't have. Everything else about it qualifies."
          : `We don't hold the fuel-efficient threshold for ${financialYearOf(registered)}, so we couldn't check the price cap.`;
    } else {
      testPrice = f.firstRetailPrice;
      threshold = thenThreshold;
    }
  }

  if (unverified == null && testPrice > threshold) {
    return no(
      preOwned
        ? `It sold for more than the ${threshold.toLocaleString("en-AU")} fuel-efficient threshold that applied when it was new, which is the test — not today's price.`
        : `Its price is above the ${threshold.toLocaleString("en-AU")} luxury car tax threshold for fuel-efficient vehicles.`,
    );
  }

  // Eligible. What it actually gets depends on when the lease starts and
  // which price band it falls in under the phase in force then.
  const asked = f.commencementDate
    ? new Date(`${f.commencementDate}T00:00:00Z`)
    : financialYearStart(config.financialYear);
  const commencement = Number.isNaN(asked.getTime())
    ? financialYearStart(config.financialYear)
    : asked;
  const phase = evPhaseFor(commencement, config);
  const exemptOutright = (phaseFrom: string | null): FbtExemptionCheck => ({
    exempt: true,
    statutoryRate: 0,
    discount: 1,
    blockedBy: null,
    unverified,
    phaseFrom,
  });
  if (!phase) return exemptOutright(null);

  const cap = phase.fullExemptUpTo;
  if (cap == null || f.vehiclePrice <= cap) return exemptOutright(phase.from);

  if (phase.discountedStatutoryRate != null) {
    return {
      exempt: false,
      statutoryRate: phase.discountedStatutoryRate,
      discount: standard > 0 ? 1 - phase.discountedStatutoryRate / standard : 0,
      blockedBy:
        `From ${phase.from} the full exemption only reaches electric cars at or under ` +
        `${cap.toLocaleString("en-AU")}. Above that, up to the luxury car tax threshold, the FBT ` +
        `is discounted rather than removed.`,
      unverified,
      phaseFrom: phase.from,
    };
  }
  return no(`The concession does not reach this car from ${phase.from}.`);
}

/** Exempt outright — no FBT at all. Anything needing the discounted middle
 *  band wants the whole check, which is why this stayed its own function. */
export function isFbtExemptVehicle(f: ExemptionFacts, config: EngineConfig): boolean {
  return checkFbtExemption(f, config).exempt;
}

export function assessFbt(
  inputs: LeaseInputs,
  finance: LeaseFinance,
  config: EngineConfig,
): FbtOutcome {
  // Base value is the GST-INCLUSIVE cost of the car to the provider (the LCT is
  // included; on-road costs like registration and stamp duty are not).
  const baseValue = finance.priceInclGst;

  // The statutory percentage is no longer a constant. An eligible electric car
  // draws nil, or 15% once the concession narrows in 2027; everything else
  // draws the standard 20%. Taking it from the check means the discounted
  // middle band flows through the taxable value, the employee contribution,
  // the FBT payable and the reportable amount without any of them knowing the
  // concession exists.
  const check = checkFbtExemption(inputs, config);
  const taxableValue = baseValue * check.statutoryRate;
  // What the taxable value WOULD be with no concession at all. An exempt car
  // still has one: the exemption removes the FBT, not the reporting, and the
  // reportable amount is worked out as though the car were taxed normally.
  // Reading the reportable figure off a nil rate would quietly delete it.
  const notionalTaxableValue = baseValue * config.fbt.statutoryRate;

  if (check.exempt) {
    return {
      exempt: true,
      exemptReason: isPreOwned(inputs.condition)
        ? `Battery-electric vehicle first registered on ${inputs.firstRegisteredDate}, after the exemption started, and under the luxury car tax threshold for fuel-efficient vehicles — exempt from FBT.`
        : "Battery-electric vehicle under the luxury car tax threshold for fuel-efficient vehicles — exempt from FBT.",
      baseValue,
      taxableValue: notionalTaxableValue,
      employeeContribution: 0,
      fbtPayable: 0,
      // An exempt car benefit is still a reportable fringe benefit: it doesn't
      // add to taxable income, but it counts towards income tests (Medicare levy
      // surcharge, HELP repayment income, family assistance).
      reportableFringeBenefit: notionalTaxableValue * config.fbt.grossUpType2,
    };
  }

  // The discounted band is not an exemption: FBT is genuinely payable on a
  // smaller taxable value, so the employee contribution that cancels it is
  // smaller too, and everything downstream follows from `taxableValue`.
  const discounted = check.discount > 0;

  /*
   * A capped employer changes what the contribution is for.
   *
   * Hospitals, ambulance services, PBIs and health promotion charities pay no
   * FBT on an employee's benefits up to an annual ceiling. Inside that ceiling
   * there is no tax to cancel — so an employee contribution cancels nothing
   * and buys nothing, while costing post-tax dollars that attract no relief at
   * all. Told to use ECM regardless, a hospital worker with cap room left
   * would hand over thousands of already-taxed dollars for no reason.
   *
   * The catch is that most of them have no room: the cap is normally spent on
   * mortgage or rent through a packaging provider before a car is considered.
   * So the room is asked for rather than assumed, and with none the answer
   * comes out exactly as it did before.
   *
   * The cap is tested on the grossed-up value using the type 2 factor,
   * whatever gross-up the FBT itself would use.
   */
  const status = inputs.employerFbtStatus ?? "ordinary";
  let cap: CapOutcome | undefined;
  let taxedTaxableValue = taxableValue;

  if (isCappedEmployer(status)) {
    const grossedUpCap = capFor(status, config);
    const used = Math.max(0, inputs.capUsedSpendable ?? 0) * config.fbt.grossUpType2;
    const available = Math.max(0, grossedUpCap - used);
    const carGrossedUp = taxableValue * config.fbt.grossUpType2;
    const sheltered = Math.min(carGrossedUp, available);
    const excess = carGrossedUp - sheltered;
    cap = {
      status,
      grossedUpCap,
      used,
      available,
      carGrossedUp,
      sheltered,
      excess,
      fullyCovered: excess <= 0 && carGrossedUp > 0,
    };
    // Only an EXEMPT employer's cap removes tax. A rebatable employer pays
    // and gets part of it back, so its taxable value is untouched here and
    // the rebate is applied to the FBT further down.
    if (status !== "rebatable") {
      taxedTaxableValue = excess / config.fbt.grossUpType2;
    }
  }
  /** True where the cap genuinely removes the tax, rather than refunding it. */
  const capExempts = cap != null && cap.status !== "rebatable";

  const concession = discounted
    ? `Electric car discount: the statutory percentage is ${(check.statutoryRate * 100).toFixed(0)}% instead of ${(config.fbt.statutoryRate * 100).toFixed(0)}%, so the taxable value is ${(check.discount * 100).toFixed(0)}% lower than it would otherwise be.`
    : null;

  if (inputs.fbtMethod === "ecm") {
    // Contribute only against the part the cap did not absorb. Inside the cap
    // the contribution would cancel a tax nobody was going to charge.
    // The contribution cancels whatever is left to tax, so nothing is payable
    // either way — including for a rebatable employer, where contributing the
    // full value leaves no FBT for a rebate to apply to.
    return {
      exempt: false,
      exemptReason: concession,
      baseValue,
      taxableValue,
      employeeContribution: taxedTaxableValue,
      fbtPayable: 0,
      // What the contribution cancelled stops being reportable. What an exempt
      // employer's cap absorbed is still a benefit and still reported — which
      // is exactly why health workers carry a reportable amount.
      reportableFringeBenefit: capExempts ? cap!.sheltered : 0,
      cap,
    };
  }

  // Gross FBT on whatever is still taxable, less a rebatable employer's rebate
  // on the part that sat inside its cap.
  const fbtPayable = Math.max(
    0,
    taxedTaxableValue * config.fbt.grossUpType1 * config.fbt.rate - rebateOn(cap, config),
  );
  return {
    exempt: false,
    exemptReason: concession,
    baseValue,
    taxableValue,
    employeeContribution: 0,
    fbtPayable,
    reportableFringeBenefit: taxableValue * config.fbt.grossUpType2,
    cap,
  };
}

/**
 * What a rebatable employer gets back on the part inside its cap.
 *
 * Rebatable is not exemption: the employer pays the FBT and is refunded a
 * share of it, so the benefit lands with the employer rather than removing
 * the tax. Zero for every other status.
 */
function rebateOn(cap: CapOutcome | undefined, config: EngineConfig): number {
  if (!cap || cap.status !== "rebatable" || cap.sheltered <= 0) return 0;
  const gross =
    (cap.sheltered / config.fbt.grossUpType2) * config.fbt.grossUpType1 * config.fbt.rate;
  return gross * config.fbt.cappedEmployers.rebateRate;
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

  /*
   * An employer's share of the saving, where there is one.
   *
   * Self-referential, and that is not a subtlety that can be skipped. The
   * share is a percentage of the relief on the lease PLUS the share, because
   * the share is itself deducted pre-tax and so relieves its own tax. Taking
   * the percentage off the relief on the lease alone understates it: on the
   * real payslip this was built against, that shortcut gives $121.62 a
   * fortnight where the document says $144.76.
   *
   * So it is solved rather than approximated. Each pass moves by the relief
   * rate — about a third — of the last correction, so it converges in a
   * handful of them; the loop is bounded anyway, because an engine that can
   * spin is worse than one that is a cent out.
   */
  /*
   * Moved above the relief because Division 293 is measured from it. Depends
   * only on salary and the pre-tax deduction, so nothing here is circular.
   */
  const superannuation = assessSuper(inputs.salary, preTaxAnnual, inputs, config);

  /*
   * Division 293 needs both sides of the comparison to carry their own
   * concessional contributions and their own reportable benefit, because
   * packaging moves the test in both directions at once:
   *
   *   · taxable income falls, which pulls Division 293 income DOWN
   *   · the reportable fringe benefit is added back, which pushes it UP, and
   *     on a grossed-up benefit it is usually the larger of the two
   *   · employer super falls with the sacrificed salary, which lowers the
   *     contributions being taxed — unless the employment agreement pays super
   *     on pre-sacrifice earnings, in which case it does not
   *
   * Three effects, two of them pulling opposite ways, and which one wins
   * depends on the car and the salary. That is precisely the situation the
   * "measure tax, don't assume it" rule exists for: both sides are handed to
   * marginalRelief as whole tax positions and the difference falls out.
   */
  const reliefBefore = {
    hasHelpDebt: inputs.hasHelpDebt,
    concessionalContributions: superannuation.before,
  };
  const reliefAfter = {
    hasHelpDebt: inputs.hasHelpDebt,
    repaymentIncomeExtra: fbt.reportableFringeBenefit,
    div293IncomeExtra: fbt.reportableFringeBenefit,
    concessionalContributions: superannuation.after,
  };
  const sharePct = Math.min(Math.max(inputs.employerSavingSharePct ?? 0, 0), 100);
  let employerShare = 0;
  if (sharePct > 0 && preTaxAnnual > 0) {
    for (let i = 0; i < 24; i++) {
      const next =
        (sharePct / 100) *
        marginalRelief(inputs.salary, preTaxAnnual + employerShare, config, reliefBefore, reliefAfter)
          .taxSaved;
      if (Math.abs(next - employerShare) < 0.005) {
        employerShare = next;
        break;
      }
      employerShare = next;
    }
  }

  // The relief is measured as the real difference the deduction makes, with the
  // reportable fringe benefit applied only to the packaged side: it doesn't
  // exist before the lease does, and it pushes HELP repayment income UP, so
  // applying it to both sides would invent a saving nobody gets.
  const relief = marginalRelief(
    inputs.salary,
    preTaxAnnual + employerShare,
    config,
    reliefBefore,
    reliefAfter,
  );

  const before: TakeHome = relief.before;
  const after: TakeHome = relief.after;
  const takeHomeAfter = after.net - postTaxAnnual;

  // What the car actually costs once the tax relief is counted. Running costs
  // paid outside the package still have to be paid, so they're added back to
  // keep the comparison honest.
  const outOfPackageRunning = inputs.includeRunningCosts ? 0 : running.total;
  // The employer's share is money out of the same pay packet as the lease, so
  // it belongs in the cost of having the car — leaving it out would make a
  // packaged car look cheaper than the payslip says it is.
  const netAnnualCost =
    preTaxAnnual + employerShare - relief.taxSaved + postTaxAnnual + outOfPackageRunning;

  /*
   * What the arrangement costs the employee, as against not having one.
   *
   * Not the same as what the employer receives, and the difference is not
   * small: the share is deducted pre-tax, so part of it is funded by tax that
   * is no longer collected rather than by the employee. Quoting the
   * employer's figure as the employee's loss overstates it by about a third.
   *
   * One extra relief calculation to get the counterfactual — the same lease
   * with no share — which is cheap and is the only honest way to name the
   * number, since it depends on where the deduction sits in the brackets.
   */
  const employerShareNetCost =
    employerShare > 0
      ? employerShare -
        (relief.taxSaved -
          marginalRelief(inputs.salary, preTaxAnnual, config, reliefBefore, reliefAfter).taxSaved)
      : 0;

  const pkg: PackageBreakdown = {
    preTaxAnnual,
    postTaxAnnual,
    taxSaved: relief.taxSaved,
    employerShare,
    employerShareNetCost,
    effectiveReliefRate: relief.effectiveRate,
    netAnnualCost,
    takeHomeBefore: before.net,
    takeHomeAfter,
    takeHomeReduction: before.net - takeHomeAfter,
  };

  const cycles = PAY_CYCLES_PER_YEAR[effectivePayCycle(inputs.payCycle, config)];
  const comparison = compareOwnership(inputs, finance, running, netAnnualCost, config);

  // --- Sanity checks the UI surfaces as plain-English warnings ---
  /*
   * An employer keeping part of the saving, said plainly.
   *
   * A warning rather than a card, because it has to reach the calculator, the
   * report and the share link without being written three times — and because
   * a reader who has been told a lease saves them a number needs to know that
   * a share of it is not theirs before they read anything else.
   *
   * Providers quote what the employee keeps, which is honest as far as it
   * goes, and never mention that it is a half. This is the only place the
   * whole figure and the split appear together.
   */
  if (employerShare > 0) {
    warnings.push(
      `Your employer keeps ${sharePct}% of the tax saving this lease creates. The packaging saves ${fmt(relief.taxSaved)} of tax a year, and ${fmt(employerShare)} of that goes to your employer as a second pre-tax deduction beside the lease. Because it comes out before tax, it costs you less than they receive: your take-home falls by ${fmt(employerShareNetCost)} a year, or ${fmt(employerShareNetCost * inputs.termYears)} over ${inputs.termYears} years, and the remaining ${fmt(employerShare - employerShareNetCost)} a year is tax nobody collects. It is a term of your employer's scheme rather than anything the financier controls, so it is worth confirming the percentage on your own payslip.`,
    );
  }
  if (finance.luxuryCarTax > 0) {
    warnings.push(
      `This car is over the luxury car tax threshold, so roughly ${fmt(finance.luxuryCarTax)} of the price you pay is luxury car tax. The GST credit is also capped at the car limit, so not all of the GST comes back.`,
    );
  }
  /*
   * The cap outcome, said out loud.
   *
   * Every one of these tells a health or charity employee something the
   * ordinary model would have got wrong for them, so they belong with the
   * engine's other warnings rather than in a card somebody might not scroll to.
   */
  // An exempt car is not a fringe benefit, so it consumes no cap at all. For
  // this group that is a genuine advantage and a silent one: without saying
  // so, somebody who set their employer and cap would watch both controls
  // change nothing and assume they had been ignored.
  if (fbt.exempt && isCappedEmployer(inputs.employerFbtStatus)) {
    warnings.push(
      `This car is exempt from FBT, so it uses none of your ${fmt(capSpendable(capFor(inputs.employerFbtStatus ?? "ordinary", config), config))} packaging cap — the whole cap stays available for rent, a mortgage or living expenses. An eligible electric car and a capped employer stack; they don't compete.`,
    );
  }
  if (fbt.cap) {
    const c = fbt.cap;
    const spendable = (n: number) => fmt(n / config.fbt.grossUpType2);
    if (c.status === "rebatable") {
      warnings.push(
        `Your employer is FBT-rebatable, which reduces the tax it pays on benefits within the ${fmt(c.grossedUpCap)} grossed-up cap — but the rebate goes to the employer, not to you. Your own position is the same as anyone else's, so the contribution below is unchanged.`,
      );
    } else if (c.fullyCovered) {
      warnings.push(
        `Your employer's FBT cap covers this car completely, so there is no fringe benefits tax to cancel and no post-tax contribution to make. That is the whole saving: post-tax dollars attract no relief, so contributing against a tax nobody was going to charge is money for nothing.`,
      );
    } else if (c.sheltered > 0) {
      warnings.push(
        `Your employer's FBT cap absorbs ${spendable(c.sheltered)} of this car, leaving ${spendable(c.excess)} to deal with the usual way. The post-tax contribution is only on that remainder.`,
      );
    } else {
      warnings.push(
        `Your FBT cap is already fully used by the ${fmt(c.used / config.fbt.grossUpType2)} a year you package, so none of it is left for this car and it is treated like any other. Packaging less elsewhere would free up room — worth checking which use of the cap is worth more to you.`,
      );
    }
    if (c.sheltered > 0) {
      warnings.push(
        `What the cap absorbs is exempt from FBT but still reported: ${fmt(c.sheltered)} goes on your income statement as a reportable fringe benefit. It is not taxable income, but it counts towards income tests — study loan repayments, the Medicare levy surcharge and family assistance among them.`,
      );
    }
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
  // Said from the engine's own conclusion rather than re-derived, so the
  // reason a car misses out is the reason it actually missed out — the price
  // cap on a new car, but just as often a used one's registration date.
  if (inputs.fuelType === "electric" && config.fbt.evExemption.enabled) {
    const exemption = checkFbtExemption(inputs, config);

    /**
     * The concession stopped being permanent, so a lease that has it needs to
     * be told it keeps it.
     *
     * This is the reassuring half of the 2026 Budget and the half nobody
     * reports: the treatment is fixed at commencement and follows the lease
     * for its life. Somebody signing a five-year lease today reads that the
     * exemption is being abolished in 2027 and reasonably assumes their own
     * deal changes underneath them. It does not — unless they refinance,
     * extend, or swap the car, which starts a new arrangement under whatever
     * the rules are then. That last part is the bit worth knowing before you
     * do it, not after.
     */
    const phases = config.fbt.evExemption.phases ?? [];
    const commencedUnder = exemption.phaseFrom;
    const laterPhase = phases.find((ph) => commencedUnder != null && ph.from > commencedUnder);
    if (exemption.exempt && laterPhase && !exemption.unverified) {
      warnings.push(
        `The electric car FBT exemption narrows from ${laterPhase.from}, but your lease keeps the treatment it starts with for its whole term. Refinancing it, extending it, or changing the car would start a new arrangement under the rules of the day — worth knowing before you do any of those, rather than after.`,
      );
    }

    // The discounted band. Not an exemption and not full FBT, and it is where
    // most electric cars worth leasing will sit from April 2027.
    if (!exemption.exempt && exemption.discount > 0) {
      const contribution = fbt.employeeContribution > 0 ? fbt.employeeContribution : fbt.fbtPayable;
      const cap = phases.find((ph) => ph.from === exemption.phaseFrom)?.fullExemptUpTo ?? 0;
      // The last phase has no full-exemption band at all. Describing that as
      // "cars at or under $0" is technically what the number says and
      // nonsense to read.
      const narrowing =
        cap > 0
          ? `the full FBT exemption only reaches electric cars at or under ${fmt(cap)}`
          : "the full FBT exemption is gone";
      warnings.push(
        `From ${exemption.phaseFrom}, ${narrowing}. This one gets the ${(exemption.discount * 100).toFixed(0)}% discount instead — the statutory percentage is ${(exemption.statutoryRate * 100).toFixed(0)}% rather than ${(config.fbt.statutoryRate * 100).toFixed(0)}% — which still leaves ${fmt(contribution)} a year to find, where an exempt car would leave nothing.`,
      );
    }

    if (!exemption.exempt && exemption.discount === 0) {
      warnings.push(`The FBT exemption does not apply to this car. ${exemption.blockedBy}`);
    } else if (exemption.exempt && exemption.unverified) {
      warnings.push(
        `We've treated this car as FBT exempt, but there's one condition we couldn't check. ${exemption.unverified} Worth confirming before you rely on it — if it turns out not to qualify, that's ${fmt(finance.priceInclGst * config.fbt.statutoryRate)} of taxable value a year.`,
      );
    }
  }
  if (inputs.purchasedFrom === "private") {
    warnings.push(
      `A private seller doesn't charge GST, so there's no credit for the financier to claim: the lease is written over the whole ${fmt(finance.priceInclGst)} rather than ${fmt(carGstCredit(finance.priceInclGst, config))} less. Check your provider will fund a private sale at all — many want a licensed dealer or an inspection first.`,
    );
  }
  if (isPreOwned(inputs.condition)) {
    warnings.push(
      "Servicing, tyres and repairs here are benchmarks for a car under warranty. On an older car budget for more, and check what warranty is left before you set the running-cost allowance.",
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
  /*
   * Division 293, said plainly, and only where it actually reaches them.
   *
   * Three separate cases, because "you pay Division 293" and "packaging this
   * car is what puts you there" are different news and the second is the one
   * that should change a decision. The figures come from the two tax positions
   * the relief was measured between, not from a fresh calculation — a second
   * sum here would be a second answer.
   */
  if (after.div293 > 0 || before.div293 > 0) {
    const extra = after.div293 - before.div293;
    const threshold = fmt(config.tax.div293?.threshold ?? 0);
    if (extra > 1) {
      warnings.push(
        `Packaging this car adds ${fmt(extra)} a year of Division 293 tax — the extra 15% on super contributions above ${threshold} of income. The reportable fringe benefit of ${fmt(fbt.reportableFringeBenefit)} counts towards that test and is larger than the salary you sacrifice, so on this income the packaging pushes you further over the line rather than under it. It is counted in the figures here.`,
      );
    } else if (extra < -1) {
      warnings.push(
        `Packaging this car reduces your Division 293 tax by ${fmt(-extra)} a year — the extra 15% on super contributions above ${threshold} of income — because the salary you sacrifice lowers that test by more than the reportable fringe benefit adds back. It is counted in the figures here.`,
      );
    } else {
      warnings.push(
        `You are over the ${threshold} Division 293 threshold, so concessional super contributions attract an extra 15%. This lease barely moves it: the reportable fringe benefit added to the test and the salary sacrificed off it very nearly cancel out.`,
      );
    }
  }

  if (inputs.hasHelpDebt && fbt.reportableFringeBenefit > config.fbt.reportingThreshold) {
    warnings.push(
      "Because the reportable fringe benefit is added to your HELP repayment income, your compulsory study-loan repayment can rise even though your taxable income falls — which eats into the saving shown here.",
    );
  }

  if (superannuation.forgone > 0) {
    warnings.push(
      `Your employer's super contributions fall by ${fmt(superannuation.forgone)} a year, because a car sacrifice reduces the earnings the guarantee is worked out on. That is lawful and it does not show on a payslip. Some employment agreements say super is paid on your salary before packaging — worth checking, because over ${inputs.termYears} years it is ${fmt(superannuation.forgone * inputs.termYears)} of contributions never made.`,
    );
  }

  return {
    inputs,
    finance,
    running,
    fbt,
    package: pkg,
    superannuation,
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
      employerShare: employerShare * inputs.termYears,
      employerShareNetCost: employerShareNetCost * inputs.termYears,
      // Net, not gross. The credit on the car is real, but the part of the car
      // bought back at the end has its GST paid — so a "GST you avoid" figure
      // that counts only the credit is overstating it by that much.
      gstSaved:
        finance.gstCredit -
        finance.residual * config.gst.rate +
        (inputs.includeRunningCosts
          ? running.total * config.gst.rate * inputs.termYears
          : 0),
      // What actually has to be found at the end: the residual plus the GST on
      // buying the car. Stating it ex-GST understated the lump by 10% in the
      // one place a reader is most likely to be planning around it.
      residualPayable: finance.residual * (1 + config.gst.rate),
    },
    warnings,
  };
}

/**
 * The two alternatives a novated lease is normally weighed against.
 *
 * Like-for-like means all three ending in the same place: owning the car, free
 * of it. Lease and loan both stop with the residual still owing, so the
 * residual is added to both — a cash buyer has already paid it, and comparing
 * a total that excludes it against one that includes it made the lease look
 * cheaper by exactly that amount. The chart said "all three leave the residual
 * owing", which was true of two of them.
 *
 * And cash is not free. Sixty thousand dollars spent on a car is sixty
 * thousand dollars not sitting in a mortgage offset, where it would quietly
 * earn the home loan rate, untaxed and without risk. That is the single
 * biggest thing missing from every cash-versus-finance comparison published
 * anywhere, and leaving it out flatters cash for the same reason leaving the
 * residual out flattered the lease. Both corrections are here, and they push
 * in opposite directions.
 */
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

  /*
   * What it costs to get the car on the road, which everybody pays.
   *
   * This used to be the car alone. The lease financed the stamp duty, the
   * registration and the CTP and repaid them with interest, while the cash
   * buyer in the next column drove away having paid for the car and nothing
   * else — about $4,800 handed to the alternatives on an ordinary car, every
   * comparison, since the on-roads field was added.
   *
   * It is the same mistake as the residual GST and it points the other way:
   * a cost that belongs to every column charged to only one of them. The
   * figure has been sitting on the finance result as driveAwayTotal the whole
   * time.
   *
   * The on-roads include a first year of registration that the running-cost
   * budget also carries. That double-count is identical in all three columns —
   * the lease finances the same on-roads — so it cancels in every comparison
   * drawn here, and fixing it is a running-cost question rather than this one.
   */
  const driveAway = finance.driveAwayTotal;

  /*
   * The same rate the decoder benchmarks quotes against.
   *
   * This used to be the lease's own rate plus 1.5, on the reasoning that a
   * personal loan prices above a novated lease. It biased every comparison
   * towards the lease and did it worst exactly where it mattered most: the
   * loan was pinned above the lease rate, so a terrible quote made the loan
   * look equally terrible and the lease kept its advantage. The one finding a
   * reader most needs — this rate is bad enough that a bank loan beats it —
   * could not appear at any rate.
   *
   * It also contradicted the decoder, which measures the same quote against
   * benchmarks.loanRatePct and says so in words. Two pages, two different
   * ideas of what a car loan costs.
   *
   * No risk premium replaces it. A secured car loan is secured on this same
   * car, and the gap between a lease rate and a loan rate is mostly the
   * provider's margin rather than the borrower's credit.
   */
  const loanRate = inputs.comparisonLoanRatePct ?? config.benchmarks.loanRatePct;
  // Same balloon as the lease residual, so the two are compared like for like:
  // both leave the buyer holding the car with the same amount still owing.
  const monthly = annuityPayment(driveAway, finance.residual, loanRate, years * 12);
  const totalRepaid = monthly * years * 12;

  // What the cash would have earned instead, compounded over the term. Zero
  // is a legitimate answer — somebody with the money idle in a transaction
  // account really is giving nothing up — so it is an input, not an
  // assumption, and the interface can set it to nothing.
  const opportunityRate =
    (inputs.opportunityRatePct ?? config.benchmarks.opportunityRatePct) / 100;
  const foregone =
    opportunityRate > 0 ? driveAway * (Math.pow(1 + opportunityRate, years) - 1) : 0;

  // Lease and loan both stop with this still owing; cash paid it up front.
  const residualSettled = finance.residual;

  /*
   * And the lease pays GST to take the car, which the other two do not.
   *
   * This was missing, and it is the sort of omission that only shows up when
   * two independent models are put side by side: the lease claimed the GST
   * credit on the whole car at the start and then bought the residual portion
   * back at the end without paying any GST on it. Ten per cent of the residual
   * of pure invention, all of it in the lease's favour, and against cash —
   * which has no residual — it went straight to the bottom line.
   *
   * The decoder has always had this right: it takes the residual GST-INCLUSIVE
   * because that is how a quote states it. The two halves of the product
   * disagreed about the same number.
   *
   * The loan's balloon carries no GST. That buyer owned the car from the day
   * they signed and paid the GST in the purchase price; their balloon is
   * nothing but deferred principal of their own loan.
   */
  const residualGstOnBuyout = finance.residual * config.gst.rate;

  const loanTotal = totalRepaid + residualSettled + runningInclGst * years;
  const cashTotal = driveAway + foregone + runningInclGst * years;
  const leaseTotal = leaseNetAnnualCost * years + residualSettled + residualGstOnBuyout;

  return {
    loan: { ratePct: loanRate, annualRepayment: monthly * 12, totalRepaid, totalCost: loanTotal },
    cash: { upfront: driveAway, foregone, totalCost: cashTotal },
    lease: { totalCost: leaseTotal },
    residualSettled,
    residualGstOnBuyout,
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
