import { describe, it, expect } from "vitest";
import {
  amountToFinance,
  carCost,
  driveAwayTotal,
  hasCarCost,
  isEmpty,
  onRoadCosts,
  type PurchaseBreakdown,
} from "@/lib/au/purchase";

const full: PurchaseBreakdown = {
  vehicle: 55_000,
  delivery: 1_800,
  accessories: 1_200,
  stampDuty: 2_100,
  registration: 900,
  ctp: 600,
  plates: 70,
  other: 30,
};

describe("What you pay for a car, split the way the tax rules split it", () => {
  // The whole point of the breakdown. Getting these two sets the wrong way
  // round charges the user FBT on their own registration.
  it("counts the car as price, delivery and fitted accessories", () => {
    expect(carCost(full)).toBe(55_000 + 1_800 + 1_200);
  });

  it("counts stamp duty, rego, CTP and plates as on-roads", () => {
    expect(onRoadCosts(full)).toBe(2_100 + 900 + 600 + 70 + 30);
  });

  it("adds up to the dealer's invoice", () => {
    expect(driveAwayTotal(full)).toBe(carCost(full) + onRoadCosts(full));
    expect(driveAwayTotal(full)).toBe(61_700);
  });

  it("finances the on-roads by default, because that is what normally happens", () => {
    expect(amountToFinance(full)).toBe(driveAwayTotal(full));
    expect(amountToFinance({ ...full, financeOnRoads: true })).toBe(driveAwayTotal(full));
  });

  it("leaves them out when the employee is paying them", () => {
    expect(amountToFinance({ ...full, financeOnRoads: false })).toBe(carCost(full));
  });

  it("treats missing parts as nothing, not as a broken total", () => {
    expect(carCost({ vehicle: 50_000 })).toBe(50_000);
    expect(onRoadCosts({ vehicle: 50_000 })).toBe(0);
    expect(driveAwayTotal({})).toBe(0);
  });

  it("knows when there is a car to work with", () => {
    expect(hasCarCost({ vehicle: 50_000 })).toBe(true);
    expect(hasCarCost({ vehicle: 0 })).toBe(false);
    expect(hasCarCost({ delivery: 1_000 })).toBe(false);
    expect(hasCarCost({})).toBe(false);
  });

  it("knows when nothing has been entered at all", () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ financeOnRoads: true })).toBe(true);
    expect(isEmpty({ vehicle: 50_000 })).toBe(false);
    expect(isEmpty({ stampDuty: 100 })).toBe(false);
  });
});
