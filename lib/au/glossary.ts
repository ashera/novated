// The words a novated lease quote uses, in the words a person would.
//
// This is not decoration. A provider's quote is a dense page of terms nobody
// has ever had to know before — base value, residual, ECM, gross-up, the car
// limit — and the reason so few people can tell a good lease from a bad one is
// that they cannot read the document describing it. Defining those terms is
// the cheapest useful thing this site can do, and it is the page somebody
// lands on from a search at the exact moment they are holding a quote and
// stuck on a word in it.
//
// Two rules follow from that.
//
// Every definition takes the live config rather than restating a rate, so the
// glossary can never drift from what the engine actually did — the same rule
// the rest of the app obeys. And every entry carries the OTHER names providers
// print, because the vocabulary is not standardised and "Lease Rental" is what
// somebody is actually looking at when they search for "finance payment".

import type { EngineConfig } from "./config";

export interface GlossaryTerm {
  /** The heading, and the anchor: slugified for deep links from anywhere. */
  term: string;
  /** What a provider might call the same thing. */
  alsoCalled?: string[];
  /** The definition. One or two sentences, plain, no hedging. */
  definition: string;
  /** Why a reader should care — omitted where the definition is the point. */
  matters?: string;
  /** Where on this site it is actually used. */
  seeHref?: string;
  seeLabel?: string;
}

export interface GlossarySection {
  heading: string;
  blurb: string;
  terms: GlossaryTerm[];
}

/** URL-safe anchor for a term, so other pages can link straight to it. */
export function termSlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
/** An ISO config date as a person would say it: "1 July 2022". */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function glossary(config: EngineConfig): GlossarySection[] {
  return [
    {
      heading: "The arrangement",
      blurb: "Who is party to what, and which part of it ends when your job does.",
      terms: [
        {
          term: "Novated lease",
          definition:
            "A car lease in three parts: you choose the car, a financier owns and leases it, and your employer agrees to make the payments out of your salary while you work there.",
          matters:
            "Only the middle party is lending you money. The employer's role is payroll, and the tax treatment is the whole reason the arrangement exists.",
          seeHref: "/how-it-works",
          seeLabel: "The mechanism in six steps",
        },
        {
          term: "Novation",
          alsoCalled: ["Deed of novation", "Novation agreement"],
          definition:
            "The document that transfers your obligation to pay the lease over to your employer for as long as you are employed there.",
          matters:
            "It is the part that ends when the job does. The lease itself doesn't — it comes back to you, and from that point it is paid out of money already taxed.",
          seeHref: "/",
          seeLabel: "What ending early costs",
        },
        {
          term: "Salary packaging",
          alsoCalled: ["Salary sacrifice"],
          definition:
            "Agreeing to take part of your pay as something other than cash — here, as a car and everything that runs it.",
          matters:
            "It reduces the income you are taxed on. It also reduces the earnings your employer works your super out on, which nobody mentions.",
        },
        {
          term: "Employee contribution method",
          alsoCalled: ["ECM", "Post-tax contribution"],
          definition:
            "Paying part of the package from salary that has already been taxed, in an amount that reduces the fringe benefits tax to nil.",
          matters:
            "Those dollars get no tax relief at all. It is the trade almost every non-exempt lease makes, because the tax it cancels is dearer than the relief it gives up.",
        },
        {
          term: "Residual",
          alsoCalled: ["Balloon", "Residual value", "Final payment"],
          definition:
            `The lump still owed on the last day of the lease. The ATO sets a minimum for each term — ${config.lease.residualMinPct["5"]}% of the amount financed over five years — and financiers may set it higher.`,
          matters:
            "It is not optional and it is not small. Whether it is a formality or a bill depends on what the car is worth that day, which is a different question.",
          seeHref: "/",
          seeLabel: "Owing against worth",
        },
        {
          term: "Term",
          definition: "How long the lease runs, usually one to five years.",
          matters:
            "A longer term means a smaller payment and a smaller residual, but more interest overall and more time for something to change.",
        },
      ],
    },
    {
      heading: "The tax",
      blurb:
        "Four ideas do most of the work. Getting them in the right order is most of understanding a lease.",
      terms: [
        {
          term: "Fringe benefits tax",
          alsoCalled: ["FBT"],
          definition:
            `Tax an employer pays for providing a benefit instead of salary. A car for private use is one, and it is charged at ${pct(config.fbt.rate)} on the grossed-up value.`,
          matters:
            "Left alone it would swallow the saving whole. Every novated lease deals with it one of two ways: the car is exempt, or you make a post-tax contribution.",
        },
        {
          term: "Statutory formula method",
          definition:
            `The standard way of valuing a car fringe benefit: a flat ${pct(config.fbt.statutoryRate)} of the car's base value each year, whatever the actual private use.`,
          matters:
            "It means the FBT does not fall if you drive less. The old alternative — a logbook — is rarely used for novated leases.",
        },
        {
          term: "Base value",
          definition:
            "The car's GST-inclusive cost price. Includes dealer delivery, luxury car tax and anything fitted before handover; excludes registration, stamp duty and CTP.",
          matters:
            `Entering a drive-away figure here is the most common and most expensive mistake on a quote — it taxes you on ${pct(config.fbt.statutoryRate)} of your own registration, every year.`,
          seeHref: "/",
          seeLabel: "Work the price out properly",
        },
        {
          term: "Grossing up",
          alsoCalled: ["Type 1 gross-up", "Type 2 gross-up"],
          definition:
            `Scaling a benefit's value up to the pre-tax salary that would have bought it. Type 1 (${config.fbt.grossUpType1}) applies where the employer claimed a GST credit; type 2 (${config.fbt.grossUpType2}) where it didn't.`,
          matters:
            "It is why FBT is so expensive relative to the benefit, and why the employee contribution method almost always wins.",
        },
        {
          term: "Reportable fringe benefits amount",
          alsoCalled: ["RFBA", "Reportable fringe benefit"],
          definition:
            "The grossed-up value of your benefit, shown on your annual income statement.",
          matters:
            "It is not taxable income, but it counts towards income tests — study loan repayments, the Medicare levy surcharge, family assistance, child support. An exempt electric car still generates one.",
        },
        {
          term: "Electric car FBT exemption",
          definition:
            `A battery-electric car first held and used from ${longDate(config.fbt.evExemption.firstHeldFrom)}, priced at or under the fuel-efficient luxury car tax threshold of ${money(config.lct.thresholdFuelEfficient)}, pays no FBT at all.`,
          matters:
            "It is being wound back in stages from 1 April 2027, and a lease keeps whatever treatment it commenced under for its whole life.",
          seeHref: "/",
          seeLabel: "Check a specific car",
        },
        {
          term: "Superannuation guarantee",
          alsoCalled: ["SG", "Employer super"],
          definition:
            `The ${config.super.guaranteeRatePct}% an employer must contribute, worked out on your ordinary earnings — which a car salary sacrifice lawfully reduces.`,
          matters:
            `No contribution is owed on earnings above ${money(config.super.maxContributionBase)} a year, so a high enough salary loses nothing. Everyone else loses ${config.super.guaranteeRatePct}% of whatever they sacrifice.`,
        },
      ],
    },
    {
      heading: "The money",
      blurb: "The figures on a quote, and which of them the interest rate falls out of.",
      terms: [
        {
          term: "Amount financed",
          alsoCalled: ["Vehicle amount financed", "Financed amount"],
          definition:
            "What the lease is actually written over: the price the financier pays, less the GST it claims back.",
          matters:
            "Always smaller than the drive-away price. If a quote shows them as the same figure, something has gone wrong.",
        },
        {
          term: "Drive-away price",
          definition:
            "What the dealer invoices in total — the car, plus stamp duty, registration, CTP and plates.",
          matters:
            "It bundles together things the tax rules keep firmly apart, which is why it is worth splitting out once rather than guessing later.",
        },
        {
          term: "On-road costs",
          definition: "Stamp duty, registration, CTP and plates.",
          matters:
            "Normally financed along with the car, so you repay them — but expressly outside the FBT base value, so you should not be taxed on them.",
        },
        {
          term: "GST credit",
          alsoCalled: ["Input tax credit"],
          definition:
            "The GST the financier recovers on buying the car, because it is a business and you are not.",
          matters:
            `Capped at one eleventh of the ${money(config.gst.carLimit)} car limit. A private seller charges no GST, so on a private sale there is nothing to claim and the whole price is financed.`,
        },
        {
          term: "Car limit",
          definition:
            `${money(config.gst.carLimit)}. Caps both the GST credit a financier can claim and the depreciation it can deduct.`,
          matters:
            "Above it the financier loses deductions and passes the cost on — usually as a line called a luxury car charge.",
        },
        {
          term: "Luxury car tax",
          alsoCalled: ["LCT"],
          definition:
            `${pct(config.lct.rate)} on the value of a car above the threshold — ${money(config.lct.thresholdFuelEfficient)} for fuel-efficient vehicles, ${money(config.lct.thresholdOther)} for everything else.`,
          matters:
            "It is inside the price you pay, and therefore inside the base value the FBT is worked out on. The fuel-efficient threshold also caps the electric car exemption.",
        },
        {
          term: "Luxury car adjustment",
          alsoCalled: ["Luxury car charge"],
          definition:
            "A charge a financier adds when the amount financed is above the car limit, recovering the deductions it cannot claim.",
          matters:
            "Quotes do not always name it. An unexplained gap between the itemised lines and the salary deduction is often this.",
        },
        {
          term: "Finance rental",
          alsoCalled: ["Lease rental", "Lease payment", "Repayments"],
          definition: "The part of the deduction that pays for the car itself, separate from running costs and fees.",
          matters:
            "It is the only line the interest rate can be recovered from. With the amount financed, the residual and the term, the rate is fully determined.",
          seeHref: "/decode",
          seeLabel: "Recover the rate from a quote",
        },
        {
          term: "Implied interest rate",
          definition:
            "The rate that must be true given the amount financed, the rental, the term and the residual.",
          matters:
            "Almost no quote prints a rate. It is not a guess — it is the same arithmetic a loan calculator does, run backwards, and it covers anything else built into the rental.",
          seeHref: "/decode",
          seeLabel: "Work it out from your quote",
        },
        {
          term: "Lease management fee",
          alsoCalled: ["Admin fee", "Lease management"],
          definition: "What the provider charges to administer the package, separate from the car.",
          matters:
            `Published pricing runs from about ${money(config.benchmarks.managementFeeAnnual.low)} to ${money(config.benchmarks.managementFeeAnnual.high)} a year, which is a wide range for the same service.`,
        },
        {
          term: "Running costs",
          alsoCalled: ["Budgets", "Operating costs"],
          definition:
            "Fuel or charging, servicing, tyres, registration, insurance and roadside — budgeted into the deduction and paid by the employer.",
          matters:
            "Packaged this way they are bought without GST and out of pre-tax salary. Budgets are estimates and are trued up, so a padded one is your money sitting with the provider.",
        },
      ],
    },
  ];
}

/** Every term, flattened — for search indexing and the structured data. */
export function allTerms(config: EngineConfig): GlossaryTerm[] {
  return glossary(config).flatMap((s) => s.terms);
}
