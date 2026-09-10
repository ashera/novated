// A quick, dependency-free smoke test of the lease engine — run it after a rate
// change or a refactor to see real numbers rather than assertions:
//   npx tsx scripts/sanity.ts
// The vitest suite is the real gate; this is for eyeballing.
import { DEFAULT_CONFIG } from "../lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "../lib/au/novated";
import { fmtCurrency } from "../lib/au/format";

const config = DEFAULT_CONFIG;

const CASES: { name: string; overrides: Partial<LeaseInputs> }[] = [
  { name: "EV, $55k, $110k salary (the headline case)", overrides: {} },
  { name: "Petrol, $45k, $110k salary (ECM)", overrides: { fuelType: "petrol", vehiclePrice: 45_000 } },
  { name: "Petrol, $45k, employer pays the FBT", overrides: { fuelType: "petrol", vehiclePrice: 45_000, fbtMethod: "employer-pays" } },
  { name: "EV over the LCT threshold ($100k)", overrides: { vehiclePrice: 100_000 } },
  { name: "Low earner ($55k salary), petrol $30k", overrides: { salary: 55_000, fuelType: "petrol", vehiclePrice: 30_000 } },
  { name: "Top bracket ($250k salary), EV $70k", overrides: { salary: 250_000, vehiclePrice: 70_000 } },
  { name: "EV with a HELP debt", overrides: { hasHelpDebt: true } },
];

for (const c of CASES) {
  const inputs = { ...defaultInputs(config), ...c.overrides };
  const r = calculateLease(inputs, config);
  const cycles = config.lease.payCyclesPerYear;
  console.log(`\n── ${c.name}`);
  console.log(`   FBT           ${r.fbt.exempt ? "EXEMPT" : `${fmtCurrency(r.fbt.taxableValue)} taxable value`}`);
  console.log(`   pre-tax/yr    ${fmtCurrency(r.package.preTaxAnnual)}`);
  console.log(`   post-tax/yr   ${fmtCurrency(r.package.postTaxAnnual)}`);
  console.log(`   tax saved     ${fmtCurrency(r.package.taxSaved)} (${(r.package.effectiveReliefRate * 100).toFixed(1)}%)`);
  console.log(`   per fortnight ${fmtCurrency(r.package.takeHomeReduction / cycles)}`);
  console.log(`   vs car loan   ${fmtCurrency(r.comparison.savingVsLoan)} better over ${r.term.years} yrs`);
  console.log(`   residual      ${fmtCurrency(r.finance.residual)}`);
  for (const w of r.warnings) console.log(`   ⚠ ${w}`);
}
