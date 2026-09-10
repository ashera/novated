import { describe, it, expect } from "vitest";
import {
  fbtYearFor,
  daysAvailableInFirstFbtYear,
  fbtProRataFactor,
} from "@/lib/au/fbtYear";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("FBT year", () => {
  it("runs 1 April to 31 March, not 1 July to 30 June", () => {
    const fy = fbtYearFor(d("2026-09-10"));
    expect(fy.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(fy.end.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(fy.label).toBe("2026-27");
  });

  it("puts a date before April in the year that began the previous April", () => {
    // The trap: 1 February 2027 is in FBT year 2026-27, not 2027-28.
    const fy = fbtYearFor(d("2027-02-01"));
    expect(fy.label).toBe("2026-27");
    expect(fy.start.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("handles both boundary days", () => {
    expect(fbtYearFor(d("2026-04-01")).label).toBe("2026-27");
    expect(fbtYearFor(d("2027-03-31")).label).toBe("2026-27");
    expect(fbtYearFor(d("2027-04-01")).label).toBe("2027-28");
  });

  it("counts 366 days when the year spans a leap day", () => {
    // 1 Apr 2023 – 31 Mar 2024 contains 29 February 2024.
    expect(fbtYearFor(d("2023-06-01")).days).toBe(366);
    expect(fbtYearFor(d("2026-06-01")).days).toBe(365);
  });
});

describe("FBT pro-rating", () => {
  it("gives a full year to a lease starting on 1 April", () => {
    expect(fbtProRataFactor(d("2026-04-01"))).toBe(1);
    expect(daysAvailableInFirstFbtYear(d("2026-04-01"))).toBe(365);
  });

  it("gives a single day to a lease starting on 31 March", () => {
    expect(daysAvailableInFirstFbtYear(d("2027-03-31"))).toBe(1);
    expect(fbtProRataFactor(d("2027-03-31"))).toBeCloseTo(1 / 365, 6);
  });

  it("pro-rates a lease delivered part-way through the year", () => {
    // 1 November 2026 to 31 March 2027 inclusive is 151 days.
    expect(daysAvailableInFirstFbtYear(d("2026-11-01"))).toBe(151);
    expect(fbtProRataFactor(d("2026-11-01"))).toBeCloseTo(151 / 365, 6);
  });

  it("accepts an ISO string as readily as a Date", () => {
    expect(fbtProRataFactor("2026-11-01")).toBeCloseTo(151 / 365, 6);
  });

  it("assumes a full year when the start date is missing or unusable", () => {
    // Silently discounting on bad input would understate the contribution,
    // which is the wrong direction to be wrong in.
    expect(fbtProRataFactor(null)).toBe(1);
    expect(fbtProRataFactor(undefined)).toBe(1);
    expect(fbtProRataFactor("not a date")).toBe(1);
  });
});
