// Australian resident income tax — the piece a novated lease turns on. Salary
// packaging works by removing income from the top of the pay packet, so what the
// employee actually saves is the MARGINAL rate (bracket + Medicare levy) on the
// packaged amount, not the average rate. Everything here is FY-parameterised via
// EngineConfig so the admin backoffice stays the single source of truth.

import type { EngineConfig, TaxConfig } from "./config";

/** Resident income tax on a taxable amount, before offsets. */
export function incomeTax(taxable: number, tax: TaxConfig): number {
  const t = Math.max(0, taxable);
  let lower = 0;
  for (const b of tax.brackets) {
    if (t <= b.upTo) return b.base + (t - lower) * b.rate;
    lower = b.upTo;
  }
  return 0; // unreachable — the last bracket runs to Infinity
}

/** Low Income Tax Offset — non-refundable, withdrawn in two tapers. */
export function lito(taxable: number, tax: TaxConfig): number {
  const i = Math.max(0, taxable);
  const l = tax.lito;
  if (i <= l.fullUpTo) return l.max;
  if (i <= l.firstTaperTo)
    return l.max - l.firstTaperRate * (i - l.fullUpTo);
  const atSecond = l.max - l.firstTaperRate * (l.firstTaperTo - l.fullUpTo);
  return Math.max(0, atSecond - l.secondTaperRate * (i - l.firstTaperTo));
}

/** The 2% Medicare levy: nil below the low-income threshold, shaded in at 10c
 *  per dollar over it, then flat. */
export function medicareLevy(taxable: number, tax: TaxConfig): number {
  const t = Math.max(0, taxable);
  const m = tax.medicare;
  if (t <= m.lowIncomeThreshold) return 0;
  return Math.min(m.rate * t, m.shadeInRate * (t - m.lowIncomeThreshold));
}

/** Compulsory HELP/HECS repayment. The rates are a marginal scale applied to
 *  repayment income; the first threshold's worth of income is repayment-free. */
export function helpRepayment(repaymentIncome: number, tax: TaxConfig): number {
  const t = Math.max(0, repaymentIncome);
  let owed = 0;
  let lower = 0;
  for (const b of tax.helpBands) {
    if (t <= lower) break;
    owed += (Math.min(t, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return owed;
}

export interface TakeHome {
  gross: number; // salary actually assessed for tax (after any pre-tax packaging)
  incomeTax: number; // bracket tax less LITO
  medicare: number;
  help: number; // compulsory study-loan repayment
  /**
   * Division 293 tax, where the income test reaches this person.
   *
   * Deliberately NOT subtracted from `net`. The other three come out through
   * PAYG withholding fortnight by fortnight; this one is an assessment issued
   * after the year ends, which the taxpayer either pays themselves or elects
   * to have released from their fund. `net` is the payslip figure and a
   * payslip has never shown Division 293, so the invariant that used to hold
   * here — net = gross less every tax above it — no longer does, and that is
   * the point rather than an oversight.
   *
   * It IS part of {@link totalTax}, because the question that function answers
   * is what packaging costs in tax overall, and this is tax overall.
   */
  div293: number;
  net: number; // what lands in the bank, before any post-tax deductions
}

/**
 * The extra 15% on concessional contributions for high earners.
 *
 * Charged on the lesser of the contributions themselves and the amount by
 * which income plus contributions clears the threshold, which is what makes it
 * phase in rather than hit like a cliff: someone $1,000 over pays 15% of
 * $1,000, not of their whole contribution.
 *
 * `income` here is Division 293 income — taxable income plus reportable fringe
 * benefits, which is where a novated lease reaches it. Net investment losses
 * and family trust distributions also belong in that sum and are not modelled;
 * they would only ever increase the liability, so what this returns is a floor.
 */
export function div293Tax(income: number, concessionalContributions: number, tax: TaxConfig): number {
  const d = tax.div293;
  if (!d || concessionalContributions <= 0) return 0;
  const over = income + concessionalContributions - d.threshold;
  if (over <= 0) return 0;
  return Math.min(concessionalContributions, over) * d.rate;
}

/** One person's whole year of PAYG on a taxable salary. `repaymentIncomeExtra`
 *  is added for the HELP calculation only — reportable fringe benefits count
 *  towards repayment income even though they are not taxable income. */
/**
 * One side of a before/after tax comparison — everything beyond the salary
 * itself that moves a tax position.
 *
 * Named and shared rather than written inline twice because `marginalRelief`
 * takes two of them and the whole method depends on the two sides being the
 * same shape: anything the packaged side can carry, the unpackaged side has to
 * be able to carry too, or the difference measures the wrong thing.
 */
export interface TaxSideOpts {
  hasHelpDebt?: boolean;
  /** Reportable fringe benefits, for HELP repayment income. */
  repaymentIncomeExtra?: number;
  /**
   * Reportable fringe benefits, for the Division 293 income test.
   *
   * Separate from `repaymentIncomeExtra` even though a lease puts the same
   * figure in both, because they are different tests that happen to agree
   * here — and a caller measuring one without the other should not be made to
   * pass a number it does not mean.
   */
  div293IncomeExtra?: number;
  /** Concessional contributions for the year — employer SG plus anything
   *  sacrificed to super. Nil means the test cannot bite, so it is skipped. */
  concessionalContributions?: number;
}

export function takeHome(
  taxableSalary: number,
  config: EngineConfig,
  opts: TaxSideOpts = {},
): TakeHome {
  const tax = config.tax;
  const gross = Math.max(0, taxableSalary);
  const net = Math.max(0, incomeTax(gross, tax) - lito(gross, tax));
  const medicare = medicareLevy(gross, tax);
  const help = opts.hasHelpDebt
    ? helpRepayment(gross + (opts.repaymentIncomeExtra ?? 0), tax)
    : 0;
  const div293 = div293Tax(
    gross + (opts.div293IncomeExtra ?? 0),
    opts.concessionalContributions ?? 0,
    tax,
  );
  return { gross, incomeTax: net, medicare, help, div293, net: gross - net - medicare - help };
}

/** Total tax borne in a year — the figure a saving is the difference between. */
export function totalTax(t: TakeHome): number {
  return t.incomeTax + t.medicare + t.help + t.div293;
}

/** The effective rate at which a *packaged* dollar is saved: the difference the
 *  packaged amount makes to total tax, divided by the amount. Calculated as a
 *  real difference rather than by reading a bracket, so bracket crossings, the
 *  LITO taper, the Medicare shade-in and HELP steps are all handled correctly.
 *
 *  The two sides take SEPARATE options on purpose. Packaging a car creates a
 *  reportable fringe benefit that did not exist before it, and that amount is
 *  added to HELP repayment income — so applying it to both sides would invent a
 *  saving that nobody actually gets. `afterOpts` describes the packaged world;
 *  `beforeOpts` describes the world without the lease. */
export function marginalRelief(
  salary: number,
  packagedAmount: number,
  config: EngineConfig,
  beforeOpts: TaxSideOpts = {},
  afterOpts: TaxSideOpts = beforeOpts,
): { taxSaved: number; effectiveRate: number; before: TakeHome; after: TakeHome } {
  const before = takeHome(salary, config, beforeOpts);
  const after = takeHome(salary - Math.max(0, packagedAmount), config, afterOpts);
  const taxSaved = totalTax(before) - totalTax(after);
  return {
    taxSaved,
    effectiveRate: packagedAmount > 0 ? taxSaved / packagedAmount : 0,
    before,
    after,
  };
}

/** The top marginal rate that applies at a given income, Medicare included —
 *  used for headline copy ("you're in the 39% bracket"), not for the numbers. */
export function marginalRate(salary: number, config: EngineConfig): number {
  const tax = config.tax;
  const band = tax.brackets.find((b) => salary <= b.upTo) ?? tax.brackets[tax.brackets.length - 1];
  const levy = salary > tax.medicare.lowIncomeThreshold * 1.25 ? tax.medicare.rate : 0;
  return band.rate + levy;
}
