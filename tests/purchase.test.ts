import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { buildFinance, defaultInputs } from "@/lib/au/novated";
import {
  amountToFinance,
  financedAfterGstCredit,
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

describe("What the builder says will be financed", () => {
  /**
   * The builder shows a "Financed" figure while the user is still typing, and
   * the engine works one out afterwards. If they disagree, the modal is
   * lying about the consequence of the numbers being entered into it — which
   * is worse than not showing a preview at all.
   *
   * They also nearly did: the first version labelled the drive-away total
   * "Financed", which is the invoice, not what the lease is written over.
   */
  const config = DEFAULT_CONFIG;
  const base = defaultInputs(config);

  const agrees = (b: Parameters<typeof financedAfterGstCredit>[0]) => {
    const preview = financedAfterGstCredit(b, config);
    const engine = buildFinance(
      {
        ...base,
        vehiclePrice: carCost(b),
        onRoadCosts: b.financeOnRoads === false ? 0 : onRoadCosts(b),
      },
      config,
    ).amountFinanced;
    expect(preview).toBeCloseTo(engine, 6);
  };

  it("agrees with the engine on a plain car", () => agrees({ vehicle: 55_000 }));

  it("agrees with delivery and accessories in the car's cost", () =>
    agrees({ vehicle: 55_000, delivery: 1_800, accessories: 1_200 }));

  it("agrees with on-roads financed", () => agrees({ ...full }));

  it("agrees with on-roads paid separately", () =>
    agrees({ ...full, financeOnRoads: false }));

  it("agrees above the car limit, where the GST credit caps", () => {
    agrees({ vehicle: 120_000, stampDuty: 6_000 });
    // And the cap really is biting, so the case is worth something.
    const credit = 120_000 - financedAfterGstCredit({ vehicle: 120_000 }, config);
    expect(credit).toBeLessThan(120_000 - 120_000 / 1.1);
  });

  it("is less than the invoice, always — that is the whole point", () => {
    expect(financedAfterGstCredit(full, config)).toBeLessThan(driveAwayTotal(full));
  });
});
