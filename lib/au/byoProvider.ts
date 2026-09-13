// "Can I use a provider my employer hasn't signed with?"
//
// The first question in getting a novated lease, and the one that decides how
// many quotes somebody can collect at all — which is to say, whether the rest
// of this site is any use to them. The quotes card has always told people to
// go and check. It has never helped them check.
//
// This is deliberately NOT a lookup. There is no register of employer
// packaging policies, and there could not be one: it is a commercial
// arrangement between an employer and a provider, renegotiated on its own
// cycle, and often not written down anywhere the employee can see. A tool
// that answered "yes" or "no" for a named employer would be confidently
// wrong, which is the failure mode this project keeps building guards against.
//
// So it does the honest version. It sets expectations from what is typical for
// that kind of employer, it says plainly that the answer lives with payroll,
// and it writes the email — because the real barrier is not the rule, it is
// that people don't know who to ask or what to ask for, and so never ask.
//
// The other thing it has to do is make a "no" survivable. Being locked to one
// provider is not the end of the road; it just moves the work from comparing
// quotes to interrogating one. That path already exists here.

/** What kind of outfit signs the payroll. */
export type EmployerKind =
  | "government"
  | "health-charity"
  | "large-corporate"
  | "small-medium"
  | "unsure";

/** What, if anything, is already set up there. */
export type Arrangement = "one" | "several" | "none" | "unsure";

/** Whether exclusivity is actually written down, or merely assumed. */
export type PolicySays = "exclusive" | "silent" | "not-checked";

export interface ByoAnswers {
  employer: EmployerKind;
  arrangement: Arrangement;
  policy: PolicySays;
}

export type Verdict = "several" | "open" | "ask" | "unlikely";

export interface ByoAssessment {
  verdict: Verdict;
  /** The short answer, as a person would say it. */
  headline: string;
  /** One or two sentences of what that means. */
  detail: string;
  /** How this conclusion was reached — never a black box. */
  reasons: string[];
  /** The questions to actually send, in order. */
  questions: string[];
  /** What to do if the answer comes back no. */
  ifNo: string;
}

export const EMPLOYER_LABEL: Record<EmployerKind, string> = {
  government: "Government or public service",
  "health-charity": "Public hospital, health service or charity",
  "large-corporate": "Large company",
  "small-medium": "Small or medium business",
  unsure: "Not sure",
};

export const ARRANGEMENT_LABEL: Record<Arrangement, string> = {
  one: "One provider, already named",
  several: "More than one to choose from",
  none: "Nothing set up that I know of",
  unsure: "Not sure",
};

export const POLICY_LABEL: Record<PolicySays, string> = {
  exclusive: "Yes — it says I have to use them",
  silent: "No — it doesn't say either way",
  "not-checked": "I haven't looked",
};

/**
 * What is typical for each kind of employer, and why.
 *
 * Context, not prediction. The point of each note is to explain the mechanism
 * behind the norm, so somebody can tell whether it applies to them rather than
 * taking the norm as their answer.
 */
export const SECTOR_NOTE: Record<EmployerKind, string> = {
  government:
    "Packaging is usually bought through a procurement panel, and the contract often names who sits on it. That is a purchasing decision rather than a rule about leases — and panels get re-tendered, sometimes with more than one provider on them, so which arrangement is current matters more than what a colleague was told two years ago.",
  "health-charity":
    "Public hospitals and registered charities package under separate FBT caps, and whoever administers those caps usually administers the lease as well. That bundling is the reason bringing your own is less common here — not a law. It also means the numbers on this site are not yet the whole story for you: the caps interact with a lease, and that is still on the list to model.",
  "large-corporate":
    "Most have one or two providers on a panel. Exclusivity there is a commercial arrangement, not a legal requirement, and plenty of employers will accept an outside provider as long as the paperwork is their standard deed and payroll doesn't have to do anything unusual.",
  "small-medium":
    "Often nothing is set up at all, which cuts both ways. There is no incumbent to displace — but your employer has to agree to run the deductions and file an FBT return they may never have filed before, so the real question is whether they will do it, not which provider.",
  unsure:
    "Worth finding out, because it changes what you are asking for. Payroll will know immediately, and it is the same email either way.",
};

/**
 * The fact the whole page rests on.
 *
 * Stated once, here, so the page and the tests read the same sentence.
 */
export const WHO_DECIDES =
  "Your employer decides, not the leasing company. The payments come out of their payroll, they sign the novation deed, and the fringe benefits tax liability and reporting are theirs — so no provider can approve this for you, and no employer is obliged to offer novated leasing at all.";

/** Who to ask, and who not to bother asking. */
export const WHO_TO_ASK =
  "Payroll, or HR if payroll is outsourced. Not the dealer, and not the packaging provider your employer already uses — they have no reason to tell you about their competitors, and they cannot give you the answer anyway.";

export function assessByo(a: ByoAnswers): ByoAssessment {
  const reasons: string[] = [];

  // More than one already on the panel is the quiet win. A lot of people in
  // this position never find out, ask the one they were told about, and take
  // the single quote — so it is checked before anything else.
  if (a.arrangement === "several") {
    return {
      verdict: "several",
      headline: "You can already compare — no need to bring anyone in.",
      detail:
        "Your employer has more than one provider set up, which is the thing bringing your own was going to buy you. Ask every one of them for a quote on the same car, term and salary, and put them side by side.",
      reasons: [
        "You said more than one provider is available to you.",
        "Competing quotes are the point of asking to bring your own — and you already have that.",
      ],
      questions: questionsFor(a),
      ifNo: IF_NO.several,
    };
  }

  if (a.arrangement === "none") {
    return {
      verdict: "open",
      headline: "Nothing is set up, so nothing is ruled out — but you're asking a bigger question.",
      detail:
        "With no incumbent there is no exclusivity to argue with, and you can nominate whoever you like. What you are really asking is whether your employer will do novated leasing at all: it means payroll deductions, signing a novation deed and an FBT return each year. Some say no simply because nobody has asked before.",
      reasons: [
        "You said nothing is set up, so there is no existing arrangement to displace.",
        "The obstacle here is the employer's willingness and admin, not a provider's exclusivity.",
      ],
      questions: questionsFor(a),
      ifNo: IF_NO.open,
    };
  }

  // One provider, or they don't know. From here it turns on whether
  // exclusivity is actually written down — which, very often, it isn't.
  if (a.arrangement === "one") {
    reasons.push("You said one provider is already named.");
  } else {
    reasons.push("You weren't sure what's set up, so this assumes the common case: one provider.");
  }

  const tightSector = a.employer === "government" || a.employer === "health-charity";

  if (a.policy === "exclusive" && tightSector) {
    reasons.push("Your policy says in writing that you have to use them.");
    reasons.push(
      a.employer === "government"
        ? "Government packaging usually runs through a procurement contract, which is harder to make an exception to than a commercial preference."
        : "Health and charity packaging is usually bundled with the FBT-cap administration, so splitting the lease out is a bigger change than it looks.",
    );
    return {
      verdict: "unlikely",
      headline: "Probably not — but asking costs one email, and a no isn't a dead end.",
      detail:
        "A written exclusivity clause in a sector that buys packaging by contract is the hardest version of this. It is still worth asking, because policies are re-tendered and exceptions exist. Plan for a no.",
      reasons,
      questions: questionsFor(a),
      ifNo: IF_NO.unlikely,
    };
  }

  if (a.policy === "exclusive") {
    reasons.push("Your policy says in writing that you have to use them.");
    reasons.push(
      "In a commercial arrangement that is a preference rather than a rule, and employers do make exceptions — but you are asking them to change something, so expect to need a reason.",
    );
  } else if (a.policy === "silent") {
    reasons.push("Nothing in your policy actually says you must use them.");
    reasons.push(
      "That is the common case, and it is usually assumed exclusivity rather than real exclusivity. Nobody asked, so the arrangement became the rule.",
    );
  } else {
    reasons.push("You haven't checked whether the policy actually says you must use them.");
    reasons.push(
      "Worth two minutes on the intranet before you send anything. Plenty of people are told 'we use X' and take it as a rule when it was only ever a default.",
    );
  }

  reasons.push(SECTOR_NOTE[a.employer]);

  return {
    verdict: "ask",
    headline: "Worth asking. It is more allowed than people assume.",
    detail:
      "Having one provider set up is not the same as being forbidden from using another. The usual answer is either yes with conditions, or a no that tells you exactly what the arrangement is — both of which are better than the assumption you are working from now.",
    reasons,
    questions: questionsFor(a),
    ifNo: IF_NO.ask,
  };
}

/**
 * What to do with a no.
 *
 * This is the half that makes the tool honest. Three quarters of the people
 * using it will be told they must use the incumbent, and a tool that stops at
 * "sorry" has walked them to a dead end. Being locked to one provider does not
 * remove the ability to check that provider's numbers — it only moves the work
 * from comparing quotes to interrogating one, which is the thing this site is
 * actually best at.
 */
const IF_NO: Record<Verdict, string> = {
  several:
    "If one of them won't quote, the others still will — and a provider who won't put a quote in writing has told you something useful about dealing with them.",
  open:
    "If your employer won't take it on at all, the lease is off the table but the car isn't. Run the same car as a loan or a cash purchase in the calculator and see what the honest gap actually is — it is often smaller than the packaging pitch implies.",
  ask: "A no still leaves you the quote you can get. Put it through the decoder: it recovers the interest rate the quote doesn't print, measures every running-cost budget against the market, and hands you the questions to send back. One provider who knows you have checked their numbers is worth more than three who don't.",
  unlikely:
    "Assume you'll be using the incumbent and make that quote work for you. The decoder finds the interest rate behind their monthly figure, flags padded running-cost budgets and compares their fees to the market — all of which is negotiable with a single provider, and none of which they expect you to know.",
};

/**
 * The email, as questions.
 *
 * The barrier is almost never the rule — it is that people don't know who to
 * ask or how to phrase it, so they never ask and quietly accept the default.
 * Question three matters most and is the one nobody thinks of: the practical
 * obstacle is usually the employer's admin, not anybody's policy.
 */
export function questionsFor(a: ByoAnswers): string[] {
  const q: string[] = [];

  if (a.arrangement === "none" || a.arrangement === "unsure") {
    q.push("Do we have an arrangement with a salary packaging or novated lease provider, and if so who?");
  } else {
    q.push("Which salary packaging or novated lease providers do we have an arrangement with?");
  }

  if (a.arrangement === "none") {
    q.push(
      "If we don't, would you be willing to set one up? I'd be arranging the lease myself — what you'd need to do is the payroll deduction and signing the novation deed.",
    );
  } else if (a.arrangement !== "several") {
    q.push(
      "Am I able to get a quote from a provider we don't have an arrangement with, or do I need to use ours?",
    );
  } else {
    q.push("Can I get a quote from each of them so I can compare?");
  }

  q.push(
    "If I can use another provider, what would you need from them to set it up — and is there a fee, a minimum notice period or a standard deed they'd have to sign?",
  );

  if (a.policy === "not-checked") {
    q.push("Is there a salary packaging policy I should read first, and where do I find it?");
  }

  q.push(
    "Roughly how long does it take from me accepting a quote to the first deduction coming out of my pay?",
  );

  return q;
}

/** The whole message, ready to send. */
export function emailFor(a: ByoAnswers): string {
  const lines = [
    "Hi,",
    "",
    "I'm looking into a novated lease and want to make sure I go about it the right way. Could you help me with a few things?",
    "",
    ...questionsFor(a).map((q, i) => `${i + 1}. ${q}`),
    "",
    "No rush — I'd just rather understand the process before I start asking providers for quotes.",
    "",
    "Thanks,",
  ];
  return lines.join("\n");
}
