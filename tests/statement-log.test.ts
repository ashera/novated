import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { parseStatement, type StatementRow } from "@/lib/au/statement";
import {
  analyseLog,
  byMonth,
  findGaps,
  mergeRows,
  removeRows,
  rowKey,
} from "@/lib/au/statementLog";

const config = DEFAULT_CONFIG;

/**
 * The real ledger, split the way a person would actually paste it.
 *
 * Portals show a page at a time, so the windows overlap: somebody pastes what
 * is on screen this month, and next month pastes a page that still contains
 * half of it. Merging has to be idempotent against that, and the hard part is
 * that the rows are not distinct — six of these are $145.71 GST credits on the
 * same day, identical in every field except the running balance.
 */
const JULY_TO_AUG = `
14 August 2026	Lease - Asset Finance Pty Ltd	-$1,602.81	$2,407.33
10 August 2026	GST Credits	$145.71	$4,010.14
10 August 2026	GST Credits	$145.71	$3,864.43
10 August 2026	GST Credits	$145.71	$3,718.72
10 August 2026	GST Credits	$145.71	$3,573.01
10 August 2026	GST Credits	$145.71	$3,427.30
10 August 2026	GST Credits	$179.62	$3,281.59
3 August 2026	Funds from Payroll	$1,698.98	$3,101.97
16 July 2026	Registration - Reimbursement	-$634.00	$1,402.99
16 July 2026	Registration - Reimbursement	-$570.00	$2,036.99
15 July 2026	Lease - Asset Finance Pty Ltd	-$1,602.81	$2,606.99
2 July 2026	Funds from Payroll	$1,698.98	$4,209.80
`;

// Next month's page: everything from 3 August on, plus four new September rows.
const AUG_TO_SEP = `
11 September 2026	Funds from Payroll	$1,698.98	$2,665.26
7 September 2026	Insurance - Reimbursement	-$218.25	$966.28
4 September 2026	GST Credits	$218.25	$1,184.53
2 September 2026	Insurance - Reimbursement	-$643.15	$966.28
31 August 2026	Maintenance - Reimbursement	-$797.90	$1,609.43
14 August 2026	Lease - Asset Finance Pty Ltd	-$1,602.81	$2,407.33
10 August 2026	GST Credits	$145.71	$4,010.14
10 August 2026	GST Credits	$145.71	$3,864.43
10 August 2026	GST Credits	$145.71	$3,718.72
10 August 2026	GST Credits	$145.71	$3,573.01
10 August 2026	GST Credits	$145.71	$3,427.30
10 August 2026	GST Credits	$179.62	$3,281.59
3 August 2026	Funds from Payroll	$1,698.98	$3,101.97
`;

const rowsOf = (text: string) => parseStatement(text).rows;

describe("Keeping a statement over time", () => {
  it("takes a first paste whole", () => {
    const r = mergeRows([], rowsOf(JULY_TO_AUG));
    expect(r.rows).toHaveLength(12);
    expect(r.added).toBe(12);
    expect(r.alreadyKnown).toBe(0);
  });

  it("adds only what is new when the next window overlaps", () => {
    const first = mergeRows([], rowsOf(JULY_TO_AUG));
    const second = mergeRows(first.rows, rowsOf(AUG_TO_SEP));
    // Four September rows and the 31 August one.
    expect(second.added).toBe(5);
    expect(second.alreadyKnown).toBe(8);
    expect(second.rows).toHaveLength(17);
  });

  /**
   * The case that makes this hard. Six credits share a date, a description and
   * an amount; only the running balance tells them apart, which is exactly how
   * the statement itself distinguishes them.
   */
  it("keeps six identical credits as six, and does not make twelve", () => {
    const first = mergeRows([], rowsOf(JULY_TO_AUG));
    const twice = mergeRows(first.rows, rowsOf(JULY_TO_AUG));
    const credits = twice.rows.filter((r) => r.kind === "gst-credit");
    expect(credits).toHaveLength(6);
    expect(twice.added).toBe(0);
    expect(twice.rows).toHaveLength(12);
  });

  it("is idempotent however many times the same page is pasted", () => {
    let log = mergeRows([], rowsOf(JULY_TO_AUG)).rows;
    for (let i = 0; i < 5; i++) log = mergeRows(log, rowsOf(AUG_TO_SEP)).rows;
    expect(log).toHaveLength(17);
  });

  it("does not care what order the windows arrive in", () => {
    const forwards = mergeRows(mergeRows([], rowsOf(JULY_TO_AUG)).rows, rowsOf(AUG_TO_SEP)).rows;
    const backwards = mergeRows(mergeRows([], rowsOf(AUG_TO_SEP)).rows, rowsOf(JULY_TO_AUG)).rows;
    expect(backwards.map(rowKey).sort()).toEqual(forwards.map(rowKey).sort());
  });

  it("keeps the log in date order", () => {
    const log = mergeRows(mergeRows([], rowsOf(AUG_TO_SEP)).rows, rowsOf(JULY_TO_AUG)).rows;
    const dates = log.map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });

  /**
   * Some providers print no running balance at all. Then identical rows cannot
   * be told apart, so they are counted: a paste is a complete view of its own
   * window, and seeing the same two charges twice means two, not four.
   */
  describe("when the provider prints no balance", () => {
    const bare = (n: number): StatementRow[] =>
      Array.from({ length: n }, () => ({
        date: "2026-08-10",
        description: "Fuel Card",
        amount: -85.4,
        balance: null,
        kind: "fuel" as const,
      }));

    it("counts identical rows rather than keying them", () => {
      const once = mergeRows([], bare(2));
      expect(once.rows).toHaveLength(2);
      const twice = mergeRows(once.rows, bare(2));
      expect(twice.rows).toHaveLength(2);
      expect(twice.added).toBe(0);
    });

    it("notices when a third one appears later", () => {
      const log = mergeRows([], bare(2)).rows;
      const more = mergeRows(log, bare(3));
      expect(more.rows).toHaveLength(3);
      expect(more.added).toBe(1);
    });
  });

  /**
   * An empty log cannot conflict with anything, and a first paste reported
   * four. The conflict search was looking at rows added by the same paste, so
   * the six GST credits that differ only by balance reported each other.
   */
  it("finds no conflicts in a first paste", () => {
    const r = mergeRows([], rowsOf(JULY_TO_AUG));
    expect(r.conflicts).toEqual([]);
  });

  it("finds none when the same window is pasted again either", () => {
    const log = mergeRows([], rowsOf(JULY_TO_AUG)).rows;
    expect(mergeRows(log, rowsOf(JULY_TO_AUG)).conflicts).toEqual([]);
  });

  /** Same transaction, different balance: the statement was restated, or one
   *  of the pastes was missing a line above it. Both are kept and flagged. */
  it("flags a row whose balance disagrees with the one already stored", () => {
    const log = mergeRows([], rowsOf(JULY_TO_AUG)).rows;
    const restated = rowsOf(JULY_TO_AUG).map((r, i) =>
      i === 0 ? { ...r, balance: r.balance! + 50 } : r,
    );
    const merged = mergeRows(log, restated);
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0].existing.date).toBe(merged.conflicts[0].incoming.date);
  });

  it("lets a row be taken back out", () => {
    const log = mergeRows([], rowsOf(JULY_TO_AUG)).rows;
    const shorter = removeRows(log, [rowKey(log[0])]);
    expect(shorter).toHaveLength(log.length - 1);
  });
});

/**
 * The reason a log beats a paste: one window always reconciles against itself
 * and looks complete. Stitch two together and the seam shows.
 */
describe("Finding what is missing", () => {
  it("sees nothing wrong with a continuous log", () => {
    const log = mergeRows(mergeRows([], rowsOf(JULY_TO_AUG)).rows, rowsOf(AUG_TO_SEP)).rows;
    expect(findGaps(log)).toEqual([]);
  });

  it("names the seam when a window in the middle was never pasted", () => {
    // July, then September — August missing entirely.
    const julyOnly = rowsOf(JULY_TO_AUG).filter((r) => r.date < "2026-08-01");
    const septOnly = rowsOf(AUG_TO_SEP).filter((r) => r.date >= "2026-09-01");
    const log = mergeRows(mergeRows([], julyOnly).rows, septOnly).rows;
    const gaps = findGaps(log);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].after.date).toBe("2026-07-16");
    expect(gaps[0].before.date).toBe("2026-09-02");
  });

  it("says so in the findings, and says the totals are short", () => {
    const julyOnly = rowsOf(JULY_TO_AUG).filter((r) => r.date < "2026-08-01");
    const septOnly = rowsOf(AUG_TO_SEP).filter((r) => r.date >= "2026-09-01");
    const log = mergeRows(mergeRows([], julyOnly).rows, septOnly).rows;
    const f = analyseLog(log, config).findings.find((x) => x.key === "log-has-gaps")!;
    expect(f.severity).toBe("warn");
    expect(f.detail).toMatch(/have not been pasted in yet/);
    expect(f.detail).toMatch(/short/);
  });
});

describe("What the log says that one statement cannot", () => {
  const log = mergeRows(mergeRows([], rowsOf(JULY_TO_AUG)).rows, rowsOf(AUG_TO_SEP)).rows;

  it("groups the money by month", () => {
    const months = byMonth(log);
    expect(months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    const aug = months.find((m) => m.month === "2026-08")!;
    expect(aug.in).toBeCloseTo(1698.98 + 145.71 * 5 + 179.62, 2);
    expect(aug.out).toBeCloseTo(1602.81 + 797.9, 2);
    expect(aug.balance).toBeCloseTo(1609.43, 2);
  });

  it("carries the single-window findings through, rather than writing them twice", () => {
    const keys = analyseLog(log, config).findings.map((f) => f.key);
    expect(keys).toContain("ledger-reconciles");
    expect(keys).toContain("gst-credits");
  });

  it("totals what has actually left payroll", () => {
    const a = analyseLog(log, config);
    expect(a.contributed).toBeCloseTo(1698.98 * 3, 2);
    expect(a.balance).toBeCloseTo(2665.26, 2);
  });

  /**
   * The change people notice and cannot explain. One statement shows the
   * current deduction; several show the step.
   */
  it("spots the deduction changing", () => {
    const raised = log.map((r) =>
      r.kind === "payroll" && r.date >= "2026-09-01" ? { ...r, amount: 1_950 } : r,
    );
    const f = analyseLog(raised, config).findings.find((x) => x.key === "deduction-changed")!;
    expect(f.severity).toBe("warn");
    expect(f.title).toMatch(/\$1,699 to \$1,950/);
    expect(f.question).toBeTruthy();
  });

  it("stays quiet while the deduction is steady", () => {
    expect(analyseLog(log, config).findings.some((f) => f.key === "deduction-changed")).toBe(false);
  });

  // A rate needs enough months behind it to be a rate rather than a number.
  it("waits for enough history before calling anything a monthly rate", () => {
    const oneMonth = log.filter((r) => r.date < "2026-08-01");
    expect(analyseLog(oneMonth, config).findings.some((f) => f.key === "where-it-goes")).toBe(false);
    expect(analyseLog(log, config).findings.some((f) => f.key === "where-it-goes")).toBe(true);
  });

  it("splits the finance from the part you have some say over", () => {
    const f = analyseLog(log, config).findings.find((x) => x.key === "where-it-goes")!;
    expect(f.detail).toMatch(/to the financier/);
    expect(f.detail).toMatch(/running costs/);
  });
});
