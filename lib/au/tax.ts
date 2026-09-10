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
  net: number; // what lands in the bank, before any post-tax deductions
}

/** One person's whole year of PAYG on a taxable salary. `repaymentIncomeExtra`
 *  is added for the HELP calculation only — reportable fringe benefits count
 *  towards repayment income even though they are not taxable income. */
export function takeHome(
  taxableSalary: number,
  config: EngineConfig,
  opts: { hasHelpDebt?: boolean; repaymentIncomeExtra?: number } = {},
): TakeHome {
  const tax = config.tax;
  const gross = Math.max(0, taxableSalary);
  const net = Math.max(0, incomeTax(gross, tax) - lito(gross, tax));
  const medicare = medicareLevy(gross, tax);
  const help = opts.hasHelpDebt
    ? helpRepayment(gross + (opts.repaymentIncomeExtra ?? 0), tax)
    : 0;
  return { gross, incomeTax: net, medicare, help, net: gross - net - medicare - help };
}

/** Total tax borne in a year — the figure a saving is the difference between. */
export function totalTax(t: TakeHome): number {
  return t.incomeTax + t.medicare + t.help;
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
  beforeOpts: { hasHelpDebt?: boolean; repaymentIncomeExtra?: number } = {},
  afterOpts: { hasHelpDebt?: boolean; repaymentIncomeExtra?: number } = beforeOpts,
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
