// Reference-data sources as first-class entities. These seeds populate the
// `sources` table; attributes (including "last updated from source") are then
// managed in the admin backoffice. Parameters reference a source by its stable
// `key` (see PARAM_DESCRIPTORS.sourceKey), so each source's set of provided
// parameters is always derivable — and every number on screen can be traced to
// a citation, which is the point.

export interface SourceSeed {
  key: string;
  name: string;
  organisation: string;
  url: string;
  updateFrequency: string;
  // Days after which the source is considered stale if not refreshed.
  // null = no scheduled review (never flagged stale).
  reviewIntervalDays: number | null;
  description: string;
}

export const SOURCE_SEEDS: SourceSeed[] = [
  {
    key: "ato-individual-rates",
    name: "Individual income tax rates",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
    updateFrequency: "Annually (1 July)",
    reviewIntervalDays: 365,
    description:
      "Resident marginal rate scale and the low income tax offset — what a pre-tax salary deduction is relieved at.",
  },
  {
    key: "ato-medicare",
    name: "Medicare levy and thresholds",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy",
    updateFrequency: "Annually (indexed)",
    reviewIntervalDays: 365,
    description: "Medicare levy rate, low-income threshold and shade-in rate.",
  },
  {
    key: "ato-help-rates",
    name: "Study and training loan repayment thresholds",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds",
    updateFrequency: "Annually (1 July)",
    reviewIntervalDays: 365,
    description:
      "Marginal HELP/HECS repayment scale. Reportable fringe benefits count towards repayment income, so a lease can change what's repaid.",
  },
  {
    key: "ato-fbt-rates",
    name: "FBT rates and gross-up rates",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/tax-rates-and-codes/fringe-benefits-tax-rates-and-thresholds",
    updateFrequency: "Annually (1 April, FBT year)",
    reviewIntervalDays: 365,
    description:
      "FBT rate, type 1 and type 2 gross-up rates, and the reportable fringe benefits threshold.",
  },
  {
    key: "ato-fbt-cars",
    name: "Car fringe benefits — statutory formula method",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/fringe-benefits-tax/types-of-fringe-benefits/fbt-on-cars-other-vehicles-parking-and-tolls",
    updateFrequency: "As the law changes",
    reviewIntervalDays: 365,
    description:
      "The flat 20% statutory percentage, base value rules, and how an employee contribution reduces the taxable value.",
  },
  {
    key: "ato-ev-exemption",
    name: "Electric vehicles exemption",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/fringe-benefits-tax/types-of-fringe-benefits/fbt-on-cars-other-vehicles-parking-and-tolls/electric-cars-exemption",
    updateFrequency: "As the law changes",
    reviewIntervalDays: 180,
    description:
      "Eligibility for the FBT exemption on zero and low-emissions vehicles, including the end of plug-in hybrid eligibility on 1 April 2025.",
  },
  {
    key: "au-depreciation",
    name: "Australian vehicle resale and depreciation data",
    organisation: "Published market data (Redbook, Datium, industry reporting)",
    url: "https://www.budgetdirect.com.au/car-insurance/guides/car-buying/car-depreciation.html",
    updateFrequency: "Continuously — a market, not a rule",
    reviewIntervalDays: 180,
    description:
      "How fast a car loses value, by fuel type. The softest numbers in the reference data and the only ones that are a forecast rather than a published rule: the spread between individual models is wider than the difference between the classes, so every figure derived from these is shown as a range.",
  },
  {
    key: "ato-lct",
    name: "Luxury car tax rate and thresholds",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/luxury-car-tax/lct-rate-and-thresholds",
    updateFrequency: "Annually (1 July, indexed)",
    reviewIntervalDays: 365,
    description:
      "LCT rate and the two thresholds. The fuel-efficient threshold also sets the price cap for the EV FBT exemption.",
  },
  {
    key: "ato-gst-cars",
    name: "GST and motor vehicles — car limit",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/motor-vehicle-and-transport/gst-and-motor-vehicles",
    updateFrequency: "Annually (1 July, indexed)",
    reviewIntervalDays: 365,
    description:
      "GST rate and the car limit, which caps the GST credit a financier can claim on the vehicle.",
  },
  {
    key: "ato-it2509",
    name: "Income Tax Ruling IT 2509 — luxury car leases and residuals",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/law/view/document?DocID=ITR/IT2509/NAT/ATO/00001",
    updateFrequency: "Rarely (ruling)",
    reviewIntervalDays: null,
    description:
      "The minimum residual value the ATO accepts at the end of a lease, by term. Financiers quote these as standard.",
  },
  {
    key: "market-lease-terms",
    name: "Novated lease market terms",
    organisation: "Industry survey (internal)",
    url: "",
    updateFrequency: "Quarterly",
    reviewIntervalDays: 90,
    description:
      "Representative financier interest rates, management fees and establishment fees, sampled across the major novated lease providers.",
  },
  {
    key: "market-quote-sample",
    name: "Novated lease quote sample",
    organisation: "Collected quotes (internal)",
    url: "",
    updateFrequency: "As quotes are collected",
    reviewIntervalDays: 180,
    description:
      "Anonymised sample of real provider quotes, used to benchmark finance rates, management fees, insurance and running-cost budgets. Providers are never named in published ranges — a provider is identified only to the user whose own quote it is.",
  },
  {
    key: "green-vehicle-guide",
    name: "Green Vehicle Guide",
    organisation: "Department of Infrastructure, Transport, Regional Development and Communications",
    url: "https://www.greenvehicleguide.gov.au/",
    updateFrequency: "Continuous",
    reviewIntervalDays: 365,
    description:
      "Official fuel consumption (L/100km) and electric energy consumption (kWh/100km) figures used for the running-cost benchmarks.",
  },
  {
    key: "aip-fuel-prices",
    name: "Weekly petrol prices report",
    organisation: "Australian Institute of Petroleum",
    url: "https://www.aip.com.au/aip-annual-retail-price-data",
    updateFrequency: "Weekly",
    reviewIntervalDays: 90,
    description: "National average retail fuel price used to budget the fuel component.",
  },
  {
    key: "aer-electricity",
    name: "Default market offer / residential electricity prices",
    organisation: "Australian Energy Regulator",
    url: "https://www.aer.gov.au/industry/retail/retail-guidelines-reviews/default-market-offer-prices",
    updateFrequency: "Annually (1 July)",
    reviewIntervalDays: 365,
    description: "Residential electricity price used to budget home charging for an EV.",
  },
  {
    key: "state-road-authorities",
    name: "Vehicle registration and CTP schedules",
    organisation: "State and territory road authorities",
    url: "",
    updateFrequency: "Annually (each state sets its own date)",
    reviewIntervalDays: 365,
    description:
      "Combined registration and compulsory third-party premium for a private passenger vehicle, per state. CTP is bundled into registration in some states and bought separately in others; these are the combined figure, which is what a lease budgets.",
  },
  {
    key: "raa-running-costs",
    name: "Vehicle running costs survey",
    organisation: "Australian motoring clubs (RACV / RAA / NRMA)",
    url: "https://www.racv.com.au/on-the-road/driving-maintenance/vehicle-running-costs.html",
    updateFrequency: "Annually",
    reviewIntervalDays: 365,
    description:
      "Servicing, tyres, registration, insurance and roadside benchmarks by vehicle class.",
  },
];
