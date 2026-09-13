import { describe, it, expect } from "vitest";
import {
  assessByo,
  emailFor,
  questionsFor,
  ARRANGEMENT_LABEL,
  EMPLOYER_LABEL,
  POLICY_LABEL,
  SECTOR_NOTE,
  type Arrangement,
  type ByoAnswers,
  type EmployerKind,
  type PolicySays,
} from "@/lib/au/byoProvider";

const EMPLOYERS = Object.keys(EMPLOYER_LABEL) as EmployerKind[];
const ARRANGEMENTS = Object.keys(ARRANGEMENT_LABEL) as Arrangement[];
const POLICIES = Object.keys(POLICY_LABEL) as PolicySays[];

/** Every combination a person can actually produce in the UI. */
const ALL: ByoAnswers[] = EMPLOYERS.flatMap((employer) =>
  ARRANGEMENTS.flatMap((arrangement) =>
    POLICIES.map((policy) => ({ employer, arrangement, policy })),
  ),
);

const a = (o: Partial<ByoAnswers> = {}): ByoAnswers => ({
  employer: "large-corporate",
  arrangement: "one",
  policy: "silent",
  ...o,
});

/**
 * The verdict is an expectation, never a ruling.
 *
 * Nothing here can know any given employer's policy — it is a commercial
 * arrangement, often unwritten, renegotiated on its own cycle. So the tests
 * guard the two things that actually matter: that the reasoning follows the
 * answers given, and that no combination produces a dead end.
 */
describe("Whether you can bring your own provider", () => {
  it("tells someone with several providers that they already have what they wanted", () => {
    for (const employer of EMPLOYERS) {
      for (const policy of POLICIES) {
        const r = assessByo(a({ employer, arrangement: "several", policy }));
        expect(r.verdict).toBe("several");
      }
    }
  });

  // Written exclusivity in a sector that buys packaging by contract is the
  // hardest version of this, and saying so is kinder than false hope.
  it("expects a no where a procurement contract and a written policy line up", () => {
    expect(assessByo(a({ employer: "government", policy: "exclusive" })).verdict).toBe("unlikely");
    expect(assessByo(a({ employer: "health-charity", policy: "exclusive" })).verdict).toBe(
      "unlikely",
    );
  });

  // The same clause in a commercial arrangement is a preference, not a rule.
  it("does not write off a written policy at an ordinary employer", () => {
    expect(assessByo(a({ employer: "large-corporate", policy: "exclusive" })).verdict).toBe("ask");
    expect(assessByo(a({ employer: "small-medium", policy: "exclusive" })).verdict).toBe("ask");
  });

  it("treats an unchecked policy as worth asking rather than as a no", () => {
    for (const employer of EMPLOYERS) {
      expect(assessByo(a({ employer, policy: "not-checked" })).verdict).toBe("ask");
      expect(assessByo(a({ employer, policy: "silent" })).verdict).toBe("ask");
    }
  });

  it("recognises that nothing set up is a different question, not an easier one", () => {
    const r = assessByo(a({ arrangement: "none" }));
    expect(r.verdict).toBe("open");
    expect(r.detail).toContain("whether your employer will do novated leasing at all");
  });

  it("assumes the common case when someone doesn't know, and says that it did", () => {
    const r = assessByo(a({ arrangement: "unsure" }));
    expect(r.verdict).toBe("ask");
    expect(r.reasons.join(" ")).toContain("assumes the common case");
  });

  it("never claims to know the answer", () => {
    for (const answers of ALL) {
      const r = assessByo(answers);
      const said = `${r.headline} ${r.detail}`.toLowerCase();
      expect(said, JSON.stringify(answers)).not.toMatch(/\byou can't\b|\byou cannot\b/);
      expect(said, JSON.stringify(answers)).not.toMatch(/\bdefinitely\b|\bguaranteed\b/);
    }
  });
});

/**
 * A "no" has to leave somewhere to go.
 *
 * Most people using this will be told to use the incumbent. A tool that stops
 * at "sorry" has walked them into a dead end — and being limited to one
 * provider does not stop anyone checking that provider's numbers, which is the
 * thing this site is actually best at.
 */
describe("Every outcome leaves somewhere to go", () => {
  it.each(ALL.map((x) => [JSON.stringify(x), x] as const))("has a next step for %s", (_label, answers) => {
    const r = assessByo(answers);
    expect(r.ifNo.length).toBeGreaterThan(60);
    expect(r.questions.length).toBeGreaterThanOrEqual(3);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.headline.trim()).not.toBe("");
    expect(r.detail.trim()).not.toBe("");
  });

  it("points a likely no at the decoder rather than at nothing", () => {
    for (const employer of ["government", "health-charity"] as EmployerKind[]) {
      const r = assessByo(a({ employer, policy: "exclusive" }));
      expect(r.ifNo.toLowerCase()).toMatch(/decoder|interest rate/);
    }
  });

  it("does not pretend a lease is the only outcome when the employer may refuse outright", () => {
    const r = assessByo(a({ arrangement: "none" }));
    expect(r.ifNo.toLowerCase()).toMatch(/loan|cash/);
  });
});

/**
 * The email is the deliverable.
 *
 * The barrier is almost never the rule — it is not knowing who to ask or how
 * to phrase it, so nobody asks and the default stands. Question three is the
 * one people never think of: the practical obstacle is usually the employer's
 * admin, not anybody's policy.
 */
describe("The message to payroll", () => {
  it("always asks what it would take to set up, not just whether it's allowed", () => {
    for (const answers of ALL) {
      expect(questionsFor(answers).join(" ")).toMatch(/what would you need|willing to set one up/i);
    }
  });

  it("asks who the providers are before asking to use another", () => {
    const qs = questionsFor(a());
    expect(qs[0]).toMatch(/which salary packaging/i);
    expect(qs[1]).toMatch(/provider we don't have an arrangement with/i);
  });

  it("asks whether there is an arrangement at all when the person doesn't know", () => {
    expect(questionsFor(a({ arrangement: "unsure" }))[0]).toMatch(/do we have an arrangement/i);
    expect(questionsFor(a({ arrangement: "none" }))[0]).toMatch(/do we have an arrangement/i);
  });

  it("asks for the policy only when it hasn't been read", () => {
    expect(questionsFor(a({ policy: "not-checked" })).join(" ")).toMatch(/policy I should read/i);
    expect(questionsFor(a({ policy: "silent" })).join(" ")).not.toMatch(/policy I should read/i);
    expect(questionsFor(a({ policy: "exclusive" })).join(" ")).not.toMatch(/policy I should read/i);
  });

  it("asks several providers to quote rather than asking permission", () => {
    const qs = questionsFor(a({ arrangement: "several" }));
    expect(qs.join(" ")).toMatch(/quote from each of them/i);
    expect(qs.join(" ")).not.toMatch(/do I need to use ours/i);
  });

  it("comes out as a message somebody could send unedited", () => {
    for (const answers of ALL) {
      const body = emailFor(answers);
      expect(body.startsWith("Hi,")).toBe(true);
      expect(body.trimEnd().endsWith("Thanks,")).toBe(true);
      // Every question numbered and present.
      for (const [i, q] of questionsFor(answers).entries()) {
        expect(body).toContain(`${i + 1}. ${q}`);
      }
    }
  });
});

describe("The sector notes explain rather than rule", () => {
  it("covers every employer type the UI offers", () => {
    for (const e of EMPLOYERS) {
      expect(SECTOR_NOTE[e], e).toBeTruthy();
      expect(SECTOR_NOTE[e].length, e).toBeGreaterThan(80);
    }
  });

  // The point of each note is the mechanism, so somebody can tell whether the
  // norm applies to them instead of taking it as their answer.
  it("says a restriction is a commercial arrangement and not a law", () => {
    expect(SECTOR_NOTE["health-charity"]).toMatch(/not a law/i);
    expect(SECTOR_NOTE["large-corporate"]).toMatch(/not a legal requirement/i);
    expect(SECTOR_NOTE.government).toMatch(/rather than a rule/i);
  });

  // Health and charity employees are modelled on ordinary rules today — their
  // caps are backlog item 13. Saying so where they are reading is the honest
  // move, and this test is what will notice when 13 ships.
  it("admits the FBT caps are not modelled yet for health and charity employees", () => {
    expect(SECTOR_NOTE["health-charity"]).toMatch(/caps/i);
    expect(SECTOR_NOTE["health-charity"]).toMatch(/still on the list|not yet/i);
  });
});
