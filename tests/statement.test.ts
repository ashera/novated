import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  classify,
  parseDate,
  parseStatement,
  readStatement,
  reconcile,
} from "@/lib/au/statement";

const config = DEFAULT_CONFIG;

/**
 * A real transaction ledger, de-identified.
 *
 * Copied from a provider's portal — the financier's name is replaced, the
 * figures are as printed. It is the fixture for everything here, because a
 * statement invented to suit the parser proves nothing about the ones people
 * actually have: the lines arrive newest first, several share a date, the
 * amounts carry dollar signs and minus signs, and two of them are a correction
 * pair that cancels out.
 */
const PASTED = `
11 September 2026	Funds from Payroll	$1,698.98	$2,665.26
7 September 2026	Insurance - Reimbursement	-$218.25	$966.28
4 September 2026	GST Credits	$218.25	$1,184.53
2 September 2026	Insurance - Reimbursement	-$643.15	$966.28
31 August 2026	Maintenance - Reimbursement	-$797.90	$1,609.43
14 August 2026	Lease - Anonymous Asset Finance Pty Ltd	-$1,602.81	$2,407.33
10 August 2026	GST Credits	$145.71	$4,010.14
10 August 2026	GST Credits	$145.71	$3,864.43
10 August 2026	GST Credits	$145.71	$3,718.72
10 August 2026	GST Credits	$145.71	$3,573.01
10 August 2026	GST Credits	$145.71	$3,427.30
10 August 2026	GST Credits	$179.62	$3,281.59
3 August 2026	Funds from Payroll	$1,698.98	$3,101.97
16 July 2026	Registration - Reimbursement	-$634.00	$1,402.99
16 July 2026	Registration - Reimbursement	-$570.00	$2,036.99
15 July 2026	Lease - Anonymous Asset Finance Pty Ltd	-$1,602.81	$2,606.99
2 July 2026	Funds from Payroll	$1,698.98	$4,209.80
`;

/** The same rows as a browser gives them when a table is selected: one cell
 *  per line, no tabs anywhere. */
const CELL_PER_LINE = `
2 July 2026
Funds from Payroll
$1,698.98
$4,209.80
15 July 2026
Lease - Anonymous Asset Finance Pty Ltd
-$1,602.81
$2,606.99
`;

describe("Reading dates off a statement", () => {
  it("takes the shapes these portals print", () => {
    expect(parseDate("11 September 2026")).toBe("2026-09-11");
    expect(parseDate("2 Jul 2026")).toBe("2026-07-02");
    expect(parseDate("2026-09-11")).toBe("2026-09-11");
    // Australian statements are day-first, and reading it the other way puts
    // September rows in November.
    expect(parseDate("11/09/2026")).toBe("2026-09-11");
  });

  it("returns nothing rather than guessing", () => {
    for (const s of ["Funds from Payroll", "$1,698.98", "", "Balance carried forward"]) {
      expect(parseDate(s), s).toBeNull();
    }
  });
});

describe("Parsing a pasted ledger", () => {
  const { rows, skipped } = parseStatement(PASTED);

  it("finds every row", () => {
    expect(rows).toHaveLength(17);
    expect(skipped).toEqual([]);
  });

  it("puts them oldest first, whatever order they were pasted in", () => {
    expect(rows[0].date).toBe("2026-07-02");
    expect(rows[rows.length - 1].date).toBe("2026-09-11");
  });

  it("reads the amount and the balance as separate columns", () => {
    const first = rows[0];
    expect(first.amount).toBeCloseTo(1698.98, 2);
    expect(first.balance).toBeCloseTo(4209.8, 2);
  });

  it("keeps the sign, which is the difference between in and out", () => {
    const lease = rows.find((r) => r.description.startsWith("Lease"))!;
    expect(lease.amount).toBeCloseTo(-1602.81, 2);
  });

  it("strips the date and the figures out of the description", () => {
    const lease = rows.find((r) => r.kind === "finance")!;
    expect(lease.description).toBe("Lease - Anonymous Asset Finance Pty Ltd");
    expect(lease.description).not.toMatch(/\d{4}|\$/);
  });

  /** A browser copying a table gives one cell per line and no tabs at all. */
  it("reads the same rows when every cell is on its own line", () => {
    const { rows: r } = parseStatement(CELL_PER_LINE);
    expect(r).toHaveLength(2);
    expect(r[0].kind).toBe("payroll");
    expect(r[1].amount).toBeCloseTo(-1602.81, 2);
    expect(r[1].balance).toBeCloseTo(2606.99, 2);
  });

  it("says what it could not read rather than dropping it", () => {
    const { rows: r, skipped: s } = parseStatement("Displaying Record 1 to 25 of 40\nFilter");
    expect(r).toHaveLength(0);
    expect(s.join(" ")).toMatch(/Displaying Record/);
  });
});

/**
 * Hyphens, which statements use as punctuation and arithmetic at once.
 *
 * Reported from real pastes: descriptions came back truncated, and it looked
 * like a problem with hyphens because a hyphen was always at the seam. It was
 * two separate faults that happened to show up in the same place.
 */
describe("Descriptions that contain a hyphen", () => {
  const desc = (line: string) => parseStatement(line).rows[0]?.description;
  const amount = (line: string) => parseStatement(line).rows[0]?.amount;

  /**
   * The date used to be removed by dropping the first three
   * whitespace-separated tokens — right for "11 September 2026" and wrong for
   * every other format, because "2026-09-11" is one token and the rule took
   * two words of the description with it.
   */
  it("keeps the whole description whatever shape the date is", () => {
    for (const date of ["2 September 2026", "2026-09-02", "2/09/2026", "02.09.2026"]) {
      expect(desc(`${date}	Insurance - Reimbursement	-$643.15	$966.28`), date).toBe(
        "Insurance - Reimbursement",
      );
    }
  });

  it("keeps a hyphen wherever it falls in the description", () => {
    expect(desc("2026-09-02	Lease - Asset Finance Pty Ltd	-1,602.81	2,407.33")).toBe(
      "Lease - Asset Finance Pty Ltd",
    );
    expect(desc("2026-09-02	Pre-tax deduction - September	-900.19	$100.00")).toBe(
      "Pre-tax deduction - September",
    );
    expect(desc("2026-09-02	Toll - M4 - Eastbound	-12.50	$900.00")).toBe(
      "Toll - M4 - Eastbound",
    );
  });

  /**
   * The costlier of the two. A minus sign was allowed a space before the
   * figure, so a description ending in a separator hyphen was read as the
   * sign: "Registration - 570.00" parsed as MINUS $570, turning a payment out
   * of the account into a payment into it — and the running balance then
   * disagreed with itself, which is how it surfaced.
   */
  it("does not read a separator hyphen as a minus sign", () => {
    expect(amount("2 September 2026  Registration - 570.00  2,036.99")).toBeCloseTo(570, 2);
    expect(amount("2 September 2026  Toll - M4 - 12.50  900.00")).toBeCloseTo(12.5, 2);
  });

  // A minus that actually belongs to the figure still counts, in every place
  // these statements put one.
  it("still reads a real negative", () => {
    expect(amount("2 September 2026	X	-643.15	966.28")).toBeCloseTo(-643.15, 2);
    expect(amount("2 September 2026	X	-$643.15	$966.28")).toBeCloseTo(-643.15, 2);
    expect(amount("2 September 2026	X	$-643.15	$966.28")).toBeCloseTo(-643.15, 2);
    expect(amount("2 September 2026	X	(643.15)	966.28")).toBeCloseTo(-643.15, 2);
    expect(amount("2 September 2026	X	643.15 DR	966.28")).toBeCloseTo(-643.15, 2);
  });

  // Some statements put a space after the dollar sign, which is not a minus.
  it("reads a spaced dollar sign as positive", () => {
    expect(amount("2 September 2026	Refund	$ 1,698.98	$2,665.26")).toBeCloseTo(1698.98, 2);
  });
});

describe("Naming what each line is", () => {
  it("recognises the lines this ledger actually contains", () => {
    expect(classify("Funds from Payroll", 1698.98)).toBe("payroll");
    expect(classify("Lease - Anonymous Asset Finance Pty Ltd", -1602.81)).toBe("finance");
    expect(classify("GST Credits", 145.71)).toBe("gst-credit");
    expect(classify("Insurance - Reimbursement", -643.15)).toBe("insurance");
    expect(classify("Registration - Reimbursement", -570)).toBe("registration");
    expect(classify("Maintenance - Reimbursement", -797.9)).toBe("maintenance");
  });

  /** "GST on Fuel" is a credit, not a fuel cost — which is why GST is tested
   *  before every other word. */
  it("treats a GST line as GST whatever else it mentions", () => {
    expect(classify("GST on Fuel", 12.5)).toBe("gst-credit");
    expect(classify("GST Credit - Lease Rental", 145.71)).toBe("gst-credit");
  });

  it("covers the words other providers use for the same things", () => {
    expect(classify("Salary Packaging Deduction", 900)).toBe("payroll");
    expect(classify("Monthly Management Fee", -19)).toBe("fee");
    expect(classify("Fuel Card Transaction", -85.4)).toBe("fuel");
    expect(classify("Tyres", -410)).toBe("tyres");
    expect(classify("Roadside Assistance", -10)).toBe("roadside");
    expect(classify("CTP Green Slip", -640)).toBe("registration");
  });

  it("admits when it does not know", () => {
    expect(classify("Sundry adjustment 4471", -12)).toBe("unknown");
  });
});

/**
 * The check nobody does, and the one a reader cannot do by eye across forty
 * rows: every printed balance is a claim about the line above it.
 */
describe("Reconciling the running balance", () => {
  const { rows } = parseStatement(PASTED);

  it("agrees with a ledger that adds up", () => {
    const r = reconcile(rows);
    expect(r.breaks).toEqual([]);
    expect(r.checked).toBe(17);
    expect(r.openingBalance).toBeCloseTo(2510.82, 2);
  });

  it("names the line where one does not", () => {
    const broken = rows.map((r, i) => (i === 5 ? { ...r, balance: r.balance! + 100 } : r));
    const r = reconcile(broken);
    // The altered row breaks, and so does the next, which is measured against it.
    expect(r.breaks.length).toBeGreaterThan(0);
    expect(r.breaks[0].row.date).toBe(rows[5].date);
    expect(r.breaks[0].printed - r.breaks[0].expected).toBeCloseTo(100, 2);
  });

  it("ignores rows that print no balance rather than assuming one", () => {
    const r = reconcile(rows.map((x) => ({ ...x, balance: null })));
    expect(r.checked).toBe(0);
    expect(r.breaks).toEqual([]);
  });

  // A statement that rounds its own display must not read as broken.
  it("tolerates half a cent", () => {
    const nudged = rows.map((r) => ({ ...r, balance: r.balance! + 0.004 }));
    expect(reconcile(nudged).breaks).toEqual([]);
  });
});

describe("What the statement says about the account", () => {
  const { rows } = parseStatement(PASTED);
  const read = readStatement(rows, config);
  const keys = read.findings.map((f) => f.key);

  it("says so when the arithmetic holds, rather than only reporting problems", () => {
    expect(keys).toContain("ledger-reconciles");
    expect(read.findings.find((f) => f.key === "ledger-reconciles")!.severity).toBe("ok");
  });

  it("totals the money by what each line is for", () => {
    expect(read.totals.payroll).toBeCloseTo(5096.94, 2);
    expect(read.totals.finance).toBeCloseTo(-3205.62, 2);
    expect(read.totals["gst-credit"]).toBeCloseTo(1126.42, 2);
  });

  it("reports the closing balance the statement printed", () => {
    expect(read.closingBalance).toBeCloseTo(2665.26, 2);
    expect(read.openingBalance).toBeCloseTo(2510.82, 2);
  });

  /**
   * The GST credits are the most misread line on these statements: they arrive
   * as money in, so they look like income, and they are a refund of GST on
   * money already spent out of the same account.
   */
  it("explains the GST credits rather than counting them as income", () => {
    const f = read.findings.find((x) => x.key === "gst-credits")!;
    expect(f.detail).toMatch(/not income/i);
    // A rental is GST-inclusive, so the credit against it is exactly a tenth
    // of the rental — that is how they can be identified rather than guessed.
    expect(f.detail).toMatch(/\$145\.71/);
    expect(f.detail).toMatch(/\$1,602\.81/);
  });

  it("notices when months of credits arrive in one batch", () => {
    const f = read.findings.find((x) => x.key === "gst-credits-delayed")!;
    expect(f.severity).toBe("warn");
    // Credits, not months — only five of the six match a month's rental, and
    // the title must not claim what the ledger does not say.
    expect(f.title).toMatch(/6 GST credits arrived on one day/);
    expect(f.title).not.toMatch(/months/);
    expect(f.detail).toMatch(/2026-08-10/);
    expect(f.question).toBeTruthy();
  });

  it("says which way the balance is heading, not just what it is", () => {
    const f = read.findings.find((x) => x.key.startsWith("account-"))!;
    expect(f).toBeTruthy();
    expect(f.detail).toMatch(/goes in/);
  });

  // A surplus is the user's money, and it does not come back clean.
  it("says whose the surplus is and that it is taxed on the way back", () => {
    const f = read.findings.find((x) => x.key === "account-filling");
    if (f) {
      expect(f.detail).toMatch(/your money/i);
      expect(f.detail).toMatch(/taxed/i);
    }
  });

  it("puts anything wrong at the top", () => {
    const broken = rows.map((r, i) => (i === 5 ? { ...r, balance: r.balance! + 100 } : r));
    const r = readStatement(broken, config);
    expect(r.findings[0].key).toBe("ledger-breaks");
    expect(r.findings[0].severity).toBe("critical");
  });

  it("names no provider of its own accord", () => {
    const said = read.findings
      .flatMap((f) => [f.title, f.detail, f.question ?? ""])
      .join(" ");
    for (const name of ["Maxxia", "SG Fleet", "Smartgroup", "RemServ", "Pepper", "Eziway"]) {
      expect(said, name).not.toContain(name);
    }
  });
});
