import { describe, it, expect } from "vitest";
import {
  financialYearLabel,
  financialYearOfIso,
  financialYearRange,
  financialYearsIn,
  inFinancialYear,
  lastCompletedFinancialYear,
} from "@/lib/au/financialYear";

/**
 * The financial year, as the accountant's view filters by it.
 *
 * Boundaries are the whole of it. 30 June and 1 July are one day apart and in
 * different years, and a filter that puts either on the wrong side drops a
 * transaction out of the period it belongs to — silently, because the row
 * simply is not there to notice.
 */
describe("Australian financial years", () => {
  describe("which year a date is in", () => {
    it("starts on 1 July", () => {
      expect(financialYearOfIso("2025-06-30")).toBe("2024-25");
      expect(financialYearOfIso("2025-07-01")).toBe("2025-26");
    });

    it("runs to 30 June", () => {
      expect(financialYearOfIso("2026-06-30")).toBe("2025-26");
      expect(financialYearOfIso("2026-07-01")).toBe("2026-27");
    });

    it("labels a year by the one it starts in", () => {
      expect(financialYearOfIso("2025-12-31")).toBe("2025-26");
      expect(financialYearOfIso("2026-01-01")).toBe("2025-26");
    });
  });

  describe("the range a year covers", () => {
    it("is 1 July to 30 June", () => {
      expect(financialYearRange("2025-26")).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    });

    it("round-trips with the year of its own ends", () => {
      for (const fy of ["2023-24", "2025-26", "2029-30"]) {
        const { from, to } = financialYearRange(fy);
        expect(financialYearOfIso(from)).toBe(fy);
        expect(financialYearOfIso(to)).toBe(fy);
      }
    });
  });

  describe("the last completed year", () => {
    /* The default the accountant's view opens on. */
    it("is the year before the one in progress", () => {
      expect(lastCompletedFinancialYear(new Date("2026-11-01T00:00:00Z"))).toBe("2025-26");
    });

    it("does not call the year in progress complete on its last day", () => {
      expect(lastCompletedFinancialYear(new Date("2026-06-30T00:00:00Z"))).toBe("2024-25");
    });

    it("moves on the day the new year starts", () => {
      expect(lastCompletedFinancialYear(new Date("2026-07-01T00:00:00Z"))).toBe("2025-26");
    });
  });

  describe("listing the years in a set of dates", () => {
    it("returns each once, most recent first", () => {
      expect(
        financialYearsIn(["2025-09-03", "2026-10-15", "2026-02-24", "2025-11-21"]),
      ).toEqual(["2026-27", "2025-26"]);
    });

    it("is empty for no dates", () => {
      expect(financialYearsIn([])).toEqual([]);
    });
  });

  describe("filtering to a year", () => {
    const rows = [
      { date: "2025-06-30" },
      { date: "2025-07-01" },
      { date: "2026-06-30" },
      { date: "2026-07-01" },
    ];

    it("keeps both ends of the year and nothing outside it", () => {
      expect(inFinancialYear(rows, "2025-26").map((r) => r.date)).toEqual([
        "2025-07-01",
        "2026-06-30",
      ]);
    });

    it("keeps everything when no year is chosen", () => {
      expect(inFinancialYear(rows, null)).toHaveLength(4);
    });
  });

  it("labels a year readably", () => {
    expect(financialYearLabel("2025-26")).toBe("2025-26 (Jul 2025 – Jun 2026)");
  });
});
