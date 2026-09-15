import { calculateLease, defaultInputs, type FuelType, type LeaseInputs } from "@/lib/au/novated";
import type { AuState, EngineConfig } from "@/lib/au/config";
import type { Finding } from "@/lib/au/quote";

/**
 * Reading a novated lease advertisement backwards.
 *
 * The ads all have the same shape, whoever prints them: a car, a big weekly
 * figure, a "total savings" number, and a footnote naming a salary, a term and
 * an annual distance. What they never print is the price of the car — which is
 * the one input everything else is derived from, and without it the weekly
 * figure cannot be checked, compared between providers, or connected to any
 * car on a dealer's website.
 *
 * That omission is what this module undoes. The engine already turns a price
 * into a weekly cost; run it against a price and compare, adjust, repeat, and
 * it turns a weekly cost back into the price the advertiser must have been
 * working from. Everything else here follows from having that number.
 *
 * Two things it is deliberately NOT:
 *
 * It is not about any particular company. The format is universal, and every
 * finding is about the format: a weekly figure with no price attached, a
 * saving with no stated baseline, a footnote describing somebody who is not
 * the reader. An ad-checker that named a provider would be an attack rather
 * than a tool, and would be wrong the moment that provider changed their
 * artwork.
 *
 * And it is not an accusation of arithmetic. The advertised weekly cost is
 * usually about right — that is the finding, and it is the reassuring half.
 * What the ad leaves out is not the cost but everything needed to judge it.
 */

export interface AdvertisedAd {
  /** The big number, per week. */
  weeklyCost: number;
  /** "Total savings", where the ad states one. */
  claimedSaving?: number;
  /** The salary in the footnote — not the reader's. */
  footnoteSalary: number;
  termYears: number;
  annualKm: number;
  fuelType: FuelType;
  state?: AuState;
  /** What the reader actually earns, when they tell us. */
  yourSalary?: number;
  /** The drive-away price the reader has found for themselves, if any. */
  knownDriveAway?: number;
}

export interface AdvertisedCheck {
  /** The price the ad must have been written against. Null when the weekly
   *  figure can't be produced by any price in a sane range. */
  impliedDriveAway: number | null;
  /** Our weekly cost at that price — the solver's residual error, in effect. */
  solvedWeekly: number | null;
  /** The lump the ad never mentions, GST included. */
  residualPayable: number | null;
  ourSavingVsLoan: number | null;
  ourSavingVsCash: number | null;
  claimedSaving: number | null;
  /** Claimed less ours, against a car loan. Positive = the ad claims more. */
  savingGap: number | null;
  /** What the same car costs a week on the reader's own salary. */
  weeklyAtYourSalary: number | null;
  /** True where this car is FBT-exempt on a lease starting today. */
  evExemptToday: boolean;
  /** The date this car stops being fully exempt, where that is in the future
   *  and would change the answer. Null when nothing is scheduled to change. */
  exemptionEndsFrom: string | null;
  findings: Finding[];
}

const MIN_PRICE = 5_000;
const MAX_PRICE = 500_000;

const inputsFor = (ad: AdvertisedAd, price: number, config: EngineConfig, over: Partial<LeaseInputs> = {}): LeaseInputs => ({
  ...defaultInputs(config),
  salary: ad.footnoteSalary,
  vehiclePrice: price,
  fuelType: ad.fuelType,
  termYears: ad.termYears,
  annualKm: ad.annualKm,
  state: ad.state,
  includeRunningCosts: true,
  ...over,
});

/**
 * The price that produces this weekly cost.
 *
 * Bisection rather than algebra: the weekly cost is monotonic in the price but
 * not remotely linear in it — insurance is a percentage of value, the GST
 * credit caps at the car limit, luxury car tax steps in, the FBT exemption
 * ends at a threshold, and an ECM contribution moves with the base value. Fifty
 * halvings of a $495,000 range settle to well under a dollar, and the result is
 * checked against the target rather than assumed.
 */
export function impliedPrice(
  ad: AdvertisedAd,
  config: EngineConfig,
): { price: number; weekly: number } | null {
  const weeklyAt = (price: number) =>
    calculateLease(inputsFor(ad, price, config), config).package.takeHomeReduction / 52;

  if (!(ad.weeklyCost > 0)) return null;
  // Outside the bracket there is no answer, and a solver that returns an
  // endpoint would report a $500,000 car with great confidence.
  if (weeklyAt(MIN_PRICE) > ad.weeklyCost || weeklyAt(MAX_PRICE) < ad.weeklyCost) return null;

  let lo = MIN_PRICE;
  let hi = MAX_PRICE;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (weeklyAt(mid) < ad.weeklyCost) lo = mid;
    else hi = mid;
  }
  const price = (lo + hi) / 2;
  return { price, weekly: weeklyAt(price) };
}

/** 1 April, the FBT year boundary the EV phases are written to. */
function nextPhaseAfter(today: Date, config: EngineConfig): string | null {
  const future = config.fbt.evExemption.phases
    .map((p) => p.from)
    .filter((from) => new Date(`${from}T00:00:00Z`) > today)
    .sort();
  return future[0] ?? null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

export function checkAdvertised(
  ad: AdvertisedAd,
  config: EngineConfig,
  today: Date = new Date(),
): AdvertisedCheck {
  const solved = impliedPrice(ad, config);
  const findings: Finding[] = [];

  const empty: AdvertisedCheck = {
    impliedDriveAway: null,
    solvedWeekly: null,
    residualPayable: null,
    ourSavingVsLoan: null,
    ourSavingVsCash: null,
    claimedSaving: ad.claimedSaving ?? null,
    savingGap: null,
    weeklyAtYourSalary: null,
    evExemptToday: false,
    exemptionEndsFrom: null,
    findings,
  };

  if (!solved) {
    findings.push({
      key: "no-price-fits",
      severity: "warn",
      category: "Price",
      title: "No car produces that weekly figure on those assumptions",
      detail:
        `At ${money(ad.footnoteSalary)} over ${ad.termYears} years with running costs packaged, ` +
        `no price between ${money(MIN_PRICE)} and ${money(MAX_PRICE)} costs ${money(ad.weeklyCost)} a week. ` +
        `Either the footnote describes a different arrangement — running costs left out, a ` +
        `different term — or the weekly figure is not the whole deduction.`,
      question: "Does that weekly figure include the running costs, or only the finance?",
    });
    return empty;
  }

  const price = solved.price;
  const base = calculateLease(inputsFor(ad, price, config), config);

  const residualPayable = base.term.residualPayable;
  const ourSavingVsLoan = base.comparison.savingVsLoan;
  const ourSavingVsCash = base.comparison.savingVsCash;
  const claimedSaving = ad.claimedSaving ?? null;
  const savingGap = claimedSaving == null ? null : claimedSaving - ourSavingVsLoan;

  /*
   * The headline finding, and the one the whole page exists for.
   *
   * It is framed as information rather than as a catch, because it is: the
   * reader now has a figure they can take to a dealer's website. Whether it
   * matches is the question the ad was arranged to avoid, and they can answer
   * it in a minute.
   */
  findings.push({
    key: "implied-price",
    severity: "ok",
    category: "Price",
    title: `That weekly figure is a car of about ${money(price)} drive-away`,
    detail:
      `Solved from the ad's own footnote — ${money(ad.footnoteSalary)} salary, ${ad.termYears} years, ` +
      `${ad.annualKm.toLocaleString("en-AU")} km a year, running costs packaged. The price is the one ` +
      `thing the ad doesn't print, and it is the one thing you can check in a minute: look the car ` +
      `up and see whether ${money(price)} is what it sells for.`,
    question: "What is the drive-away price of the car in that deal?",
  });

  if (ad.knownDriveAway != null && ad.knownDriveAway > 0) {
    const gap = price - ad.knownDriveAway;
    const off = Math.abs(gap) / ad.knownDriveAway;
    if (off > 0.05) {
      findings.push({
        key: gap > 0 ? "price-above-market" : "price-below-market",
        severity: "warn",
        category: "Price",
        title:
          gap > 0
            ? `That is ${money(gap)} more than the price you found`
            : `That is ${money(-gap)} less than the price you found`,
        detail:
          gap > 0
            ? `You gave ${money(ad.knownDriveAway)} as the drive-away price. The weekly figure implies ` +
              `${money(price)}, so something is adding cost the ad hasn't named — accessories, a ` +
              `higher trim, fees financed into the deal, or a rate above the one we assume. Ask ` +
              `which.`
            : `You gave ${money(ad.knownDriveAway)} as the drive-away price, and the weekly figure ` +
              `implies only ${money(price)}. The ad may be quoting a lower trim or a shorter list of ` +
              `running costs than the one you priced.`,
        costOverTerm: Math.abs(gap),
        question: "Which variant and what price is that weekly figure based on?",
      });
    } else {
      findings.push({
        key: "price-checks-out",
        severity: "ok",
        category: "Price",
        title: "The weekly figure matches the car you priced",
        detail:
          `${money(ad.knownDriveAway)} drive-away produces something very close to ${money(ad.weeklyCost)} ` +
          `a week on the footnote's assumptions. The advertised cost is not the problem — what the ad ` +
          `leaves out is.`,
      });
    }
  }

  /*
   * The residual.
   *
   * Never on an advertisement, and on these terms it is a fifth of what the
   * car cost, due in one payment on a day the reader has not thought about.
   * It is not a criticism of the lease — it is how a lease works — but a
   * weekly cost quoted without it describes less than the whole obligation.
   */
  findings.push({
    key: "residual-not-advertised",
    severity: "warn",
    category: "Framing",
    title: `${money(residualPayable)} is due at the end, and isn't in the weekly figure`,
    detail:
      `A lease deliberately doesn't pay the car off. On this one the residual is ` +
      `${money(residualPayable)} including GST, payable when the term ends — you pay it to keep the ` +
      `car, refinance it, or sell and settle up. The weekly cost is real; it just isn't the whole ` +
      `obligation, and no advertisement has room for the sentence that says so.`,
    costOverTerm: residualPayable,
  });

  if (claimedSaving != null && savingGap != null) {
    const key =
      Math.abs(savingGap) <= Math.max(1_500, ourSavingVsLoan * 0.1)
        ? "saving-agrees"
        : savingGap > 0
          ? "saving-overstated"
          : "saving-understated";

    if (key === "saving-agrees") {
      findings.push({
        key,
        severity: "ok",
        category: "Saving",
        title: "Their saving is about what we make it",
        detail:
          `They claim ${money(claimedSaving)}. Against a car loan on the same car, over the same ` +
          `term, with the residual settled in both columns, we make it ${money(ourSavingVsLoan)}. ` +
          `Close enough that they are measuring roughly the same thing we are.`,
      });
    } else if (key === "saving-overstated") {
      findings.push({
        key,
        severity: "warn",
        category: "Saving",
        title: `Their saving is ${money(savingGap)} more than we can account for`,
        detail:
          `They claim ${money(claimedSaving)}. Measured against a car loan on the same car — same ` +
          `term, same residual owing at the end of both — we make it ${money(ourSavingVsLoan)}. ` +
          `The gap is not necessarily wrong: "savings" has no agreed definition, and a bigger number ` +
          `usually means a different baseline. The common ones are comparing against paying for ` +
          `everything out of taxed income with no finance at all, and not settling the residual in ` +
          `the comparison. The ad doesn't say which, and that is the problem with the number rather ` +
          `than the number itself.`,
        costOverTerm: savingGap,
        question: "What exactly is that total savings figure measured against?",
      });
    } else {
      findings.push({
        key,
        severity: "ok",
        category: "Saving",
        title: "Their saving is more conservative than ours",
        detail:
          `They claim ${money(claimedSaving)}; against a car loan we make it ${money(ourSavingVsLoan)}. ` +
          `A provider understating the benefit is unusual enough to be worth asking about — most ` +
          `often it means their comparison leaves out the running costs, or uses a different rate.`,
        question: "What is that savings figure measured against?",
      });
    }
  } else {
    findings.push({
      key: "saving-unmeasured",
      severity: "ok",
      category: "Saving",
      title: "A saving with no stated baseline can't be checked",
      detail:
        `Against a car loan on the same car, with the residual settled in both columns, we make this ` +
        `one worth ${money(ourSavingVsLoan)} over the term. Any advertised "saving" is a comparison, ` +
        `and it is only as good as what it is compared against — which these ads do not print.`,
    });
  }

  /*
   * The footnote describes somebody else.
   *
   * Every one of these ads is costed at a single salary, and the whole benefit
   * is a function of the reader's marginal rate. This is the one finding that
   * can be answered exactly, for them, right now.
   */
  let weeklyAtYourSalary: number | null = null;
  if (ad.yourSalary != null && ad.yourSalary > 0) {
    const mine = calculateLease(inputsFor(ad, price, config, { salary: ad.yourSalary }), config);
    weeklyAtYourSalary = mine.package.takeHomeReduction / 52;
    const diff = weeklyAtYourSalary - ad.weeklyCost;
    if (Math.abs(diff) >= 2) {
      findings.push({
        key: diff > 0 ? "costs-you-more" : "costs-you-less",
        severity: diff > 0 ? "warn" : "ok",
        category: "You",
        title:
          diff > 0
            ? `On your salary it is ${money(weeklyAtYourSalary)} a week, not ${money(ad.weeklyCost)}`
            : `On your salary it is ${money(weeklyAtYourSalary)} a week, less than advertised`,
        detail:
          `The footnote prices this for somebody earning ${money(ad.footnoteSalary)}. You told us ` +
          `${money(ad.yourSalary)}. The whole benefit runs off your marginal tax rate, so the ` +
          `advertised figure is not a quote for you — it is a quote for a person the advertiser chose. ` +
          `Yours is ${money(Math.abs(diff))} a week ${diff > 0 ? "more" : "less"}.`,
        costOverTerm: Math.abs(diff) * 52 * ad.termYears,
      });
    }
  }

  /*
   * The shelf life on an electric car's numbers.
   *
   * The concession is fixed at commencement and then follows the lease for
   * life, so an ad's EV figures are true for a lease signed under today's
   * phase and may be untrue for the identical car signed after the next one.
   * A flyer has no expiry date printed on it.
   */
  const evExemptToday = base.fbt.exempt;
  let exemptionEndsFrom: string | null = null;
  if (ad.fuelType === "electric" && evExemptToday) {
    const from = nextPhaseAfter(today, config);
    if (from) {
      const later = calculateLease(
        inputsFor(ad, price, config, { commencementDate: from }),
        config,
      );
      if (!later.fbt.exempt) {
        exemptionEndsFrom = from;
        const thenWeekly = later.package.takeHomeReduction / 52;
        findings.push({
          key: "exemption-has-a-deadline",
          severity: "warn",
          category: "Timing",
          title: `These figures need a lease that starts before ${from}`,
          detail:
            `This car is FBT-exempt today, which is most of what makes the weekly cost look like ` +
            `that. From ${from} the concession narrows and this car falls outside it — the same car, ` +
            `same price, same salary, would be about ${money(thenWeekly)} a week instead of ` +
            `${money(ad.weeklyCost)}. Which side of that date a lease commences on is fixed for its ` +
            `whole life, so this is a question of when the paperwork is signed, not when the ad was ` +
            `printed.`,
          costOverTerm: Math.max(0, (thenWeekly - ad.weeklyCost) * 52 * ad.termYears),
          question: `Can the lease commence before ${from}, and what happens if it can't?`,
        });
      }
    }
  }

  // Costliest first, as everywhere else — except the implied price, which is
  // the answer to the question the page was opened with and stays at the top
  // whether or not it carries a number.
  findings.sort((a, b) => {
    if (a.key === "implied-price") return -1;
    if (b.key === "implied-price") return 1;
    return (b.costOverTerm ?? 0) - (a.costOverTerm ?? 0);
  });

  return {
    impliedDriveAway: price,
    solvedWeekly: solved.weekly,
    residualPayable,
    ourSavingVsLoan,
    ourSavingVsCash,
    claimedSaving,
    savingGap,
    weeklyAtYourSalary,
    evExemptToday,
    exemptionEndsFrom,
    findings,
  };
}
