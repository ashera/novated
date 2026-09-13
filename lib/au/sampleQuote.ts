// A quote that doesn't exist, from a provider that doesn't exist.
//
// The decoder has always opened on a worked example so the page shows what it
// does rather than an empty form. This is the other half of that: the DOCUMENT
// those figures were read off, so somebody who has never been sent a quote can
// see what one looks like before they ask for one.
//
// The two are the same data. The quote fixture below is what the decoder
// loads, and the document is built from the same object with the labels a
// provider would actually print — "Vehicle Amount Financed" rather than
// "Amount financed", "Lease Rental" rather than "Finance payment". That
// mismatch is most of what makes a first quote hard to read, so it is the
// point of showing it rather than an accident of the mock-up.
//
// The figures are deliberately not a clean example:
//
//   - the car is above the GST car limit, so the lease carries a luxury car
//     adjustment the quote never names;
//   - the maintenance budget is padded against the benchmark;
//   - and the listed lines add up to less than the salary deduction, by
//     almost exactly that unnamed adjustment.
//
// Everything the decoder finds in it is therefore something a real quote does.

import type { Quote } from "./quote";

/**
 * The provider.
 *
 * Invented, and labelled as invented everywhere it appears. It must not be
 * mistakable for a document a real company sent: no real provider's name,
 * branding or wording, and a SAMPLE mark on the page itself.
 */
export const SAMPLE_PROVIDER = "Eucalypt Vehicle Leasing";
export const SAMPLE_REFERENCE = "EVL-48211";

/** The worked example the decoder opens on. */
export const SAMPLE_QUOTE: Quote = {
  label: "Example quote",
  frequency: "fortnightly",
  vehiclePrice: 85_000,
  fuelType: "electric",
  amountFinanced: 78_666,
  residualIncGst: 24_342,
  termMonths: 60,
  salary: 130_000,
  annualKm: 15_000,
  statedPreTax: 900.19,
  statedPostTax: 0,
  lines: {
    finance: 650.19,
    energy: 24.23,
    maintenance: 22.0,
    tyres: 16.5,
    registration: 32.0,
    insurance: 115.0,
    managementFee: 19.0,
  },
};

/** The car, as the document describes it. Cosmetic: nothing reads it back. */
export const SAMPLE_VEHICLE = {
  description: "Tesla Model Y RWD",
  year: "2026",
  colour: "Quicksilver",
};

/**
 * One line on the printed quote.
 *
 * `field` is what the same figure is called on our form — the whole reason
 * the document is worth showing. `marker` numbers the ones worth pointing at;
 * lines without one are there because a real quote has them, not because
 * anything is asked about them.
 */
export interface SampleLine {
  /** What the provider prints. */
  label: string;
  /** The figure, already formatted the way a quote would show it. */
  value: string;
  /** What we call it, where we ask for it. */
  field?: string;
  marker?: number;
  /** Rendered as a total rather than an item. */
  total?: boolean;
}

export interface SampleSection {
  heading: string;
  /** Printed under the heading, the way a quote states its period once. */
  note?: string;
  markerOnHeading?: number;
  lines: SampleLine[];
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lines = SAMPLE_QUOTE.lines;

/** The itemised inclusions, before the total the provider states. */
export const SAMPLE_ITEM_TOTAL =
  (lines.finance ?? 0) +
  (lines.energy ?? 0) +
  (lines.maintenance ?? 0) +
  (lines.tyres ?? 0) +
  (lines.registration ?? 0) +
  (lines.insurance ?? 0) +
  (lines.managementFee ?? 0);

/** What the quote says leaves each pay, less what it itemised. */
export const SAMPLE_GAP = (SAMPLE_QUOTE.statedPreTax ?? 0) - SAMPLE_ITEM_TOTAL;

export const SAMPLE_SECTIONS: SampleSection[] = [
  {
    heading: "Vehicle",
    lines: [
      { label: "Description", value: `${SAMPLE_VEHICLE.year} ${SAMPLE_VEHICLE.description}` },
      { label: "Colour", value: SAMPLE_VEHICLE.colour },
      {
        label: "Drive-Away Price (incl. GST)",
        value: `$${money(SAMPLE_QUOTE.vehiclePrice ?? 0)}`,
        field: "Price of the car",
        marker: 1,
      },
      { label: "Estimated Annual Kilometres", value: "15,000", field: "Kilometres a year" },
    ],
  },
  {
    heading: "Finance",
    lines: [
      {
        label: "Vehicle Amount Financed",
        value: `$${money(SAMPLE_QUOTE.amountFinanced ?? 0)}`,
        field: "Amount financed",
        marker: 2,
      },
      {
        label: "Residual Value (incl. GST)",
        value: `$${money(SAMPLE_QUOTE.residualIncGst ?? 0)}`,
        field: "Residual",
        marker: 3,
      },
      { label: "Lease Term", value: "60 months", field: "Term", marker: 4 },
      { label: "Financier", value: "Eucalypt Finance Pty Ltd" },
    ],
  },
  {
    heading: "Salary Packaging Deductions",
    note: "All amounts per fortnight, excluding GST",
    markerOnHeading: 5,
    lines: [
      {
        label: "Lease Rental",
        value: `$${money(lines.finance ?? 0)}`,
        field: "Finance payment",
        marker: 6,
      },
      {
        label: "Fuel / Charging",
        value: `$${money(lines.energy ?? 0)}`,
        field: "Fuel or charging",
      },
      { label: "Maintenance", value: `$${money(lines.maintenance ?? 0)}`, field: "Servicing" },
      { label: "Tyres", value: `$${money(lines.tyres ?? 0)}`, field: "Tyres" },
      {
        label: "Registration & CTP",
        value: `$${money(lines.registration ?? 0)}`,
        field: "Registration",
      },
      {
        label: "Comprehensive Insurance",
        value: `$${money(lines.insurance ?? 0)}`,
        field: "Insurance",
      },
      {
        label: "Lease Management Fee",
        value: `$${money(lines.managementFee ?? 0)}`,
        field: "Management fee",
        marker: 7,
      },
      {
        label: "Total Pre-Tax Deduction",
        value: `$${money(SAMPLE_QUOTE.statedPreTax ?? 0)}`,
        field: "Deducted before tax",
        marker: 8,
        total: true,
      },
      {
        label: "Post-Tax Employee Contribution",
        value: `$${money(SAMPLE_QUOTE.statedPostTax ?? 0)}`,
        field: "Deducted after tax",
        total: true,
      },
    ],
  },
];

/** What each marker is trying to teach, in the order they appear. */
export const SAMPLE_MARKERS: { marker: number; title: string; body: string }[] = [
  {
    marker: 1,
    title: "The price is drive-away, not the car",
    body:
      "It bundles stamp duty, registration and CTP in with the car. The FBT is worked out on the car alone, so those have to come back out — the price builder on your lease does it.",
  },
  {
    marker: 2,
    title: "Less than the price, always",
    body:
      "The financier buys the car and claims the GST back, so the lease is written over about a ninth less than the drive-away figure. If the two are the same, something is wrong.",
  },
  {
    marker: 3,
    title: "What is still owing at the end",
    body:
      "Quoted with GST in it. The ATO sets a minimum for the term and providers may set it higher, which lowers the payment now and leaves more owing later.",
  },
  {
    marker: 4,
    title: "The term, in months",
    body: "Sixty months is five years. Providers quote 36, 48 and 60 on the same car.",
  },
  {
    marker: 5,
    title: "Stated once, and easy to miss",
    body:
      "Every figure below this heading is per fortnight. Read it as monthly and everything you work out is more than twice what it should be — which is why we ask for it before anything else.",
  },
  {
    marker: 6,
    title: "The only line the rate can be recovered from",
    body:
      "Finance, separate from the running costs. With this, the amount financed, the residual and the term, the interest rate is fully determined — and this quote never prints it.",
  },
  {
    marker: 7,
    title: "What the provider charges to run it",
    body: "A fee for administering the package, not a cost of the car.",
  },
  {
    marker: 8,
    title: "The number the quote leads with — and it doesn't add up",
    body:
      `The lines above total $${money(SAMPLE_ITEM_TOTAL)}. This says $${money(SAMPLE_QUOTE.statedPreTax ?? 0)}. Nothing on the page explains the $${money(SAMPLE_GAP)}, and it is close to the luxury car adjustment this car attracts for being financed above the car limit — a charge the quote never names.`,
  },
];
