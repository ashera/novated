import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  applyQuoteEdit,
  leaseToInputs,
  leaseToQuote,
  migrateLease,
  newLease,
  newQuoteSpec,
  quoteStatus,
  type Lease,
} from "@/lib/au/lease";
import { calculateLease } from "@/lib/au/novated";
import { decodeQuote } from "@/lib/au/quote";

const config = DEFAULT_CONFIG;

function leaseWithCar(): Lease {
  const l = newLease("Test");
  return {
    ...l,
    vehicle: {
      vehicleId: "tesla-model-y",
      price: 72_000,
      fuelType: "electric",
      annualKm: 18_000,
      state: "VIC",
      consumptionPer100km: 14.9,
    },
  };
}

describe("Lease as the shared parent", () => {
  it("gives the calculator the lease's car", () => {
    const i = leaseToInputs(leaseWithCar());
    expect(i.vehicleId).toBe("tesla-model-y");
    expect(i.vehiclePrice).toBe(72_000);
    expect(i.fuelType).toBe("electric");
    expect(i.annualKm).toBe(18_000);
    expect(i.state).toBe("VIC");
    expect(i.consumptionPer100km).toBe(14.9);
  });

  it("gives the decoder the same car, without it being entered twice", () => {
    const lease = leaseWithCar();
    const spec = newQuoteSpec("Provider A");
    const q = leaseToQuote({ ...lease, quotes: [spec] }, spec);
    expect(q.vehicleId).toBe("tesla-model-y");
    expect(q.vehiclePrice).toBe(72_000);
    expect(q.annualKm).toBe(18_000);
    expect(q.state).toBe("VIC");
  });

  it("keeps both tools describing the same car", () => {
    // The whole reason the entity exists.
    const lease = leaseWithCar();
    const spec = newQuoteSpec();
    const withQuote = { ...lease, quotes: [spec] };
    const i = leaseToInputs(withQuote);
    const q = leaseToQuote(withQuote, spec);
    expect(q.vehiclePrice).toBe(i.vehiclePrice);
    expect(q.fuelType).toBe(i.fuelType);
    expect(q.annualKm).toBe(i.annualKm);
    expect(q.state).toBe(i.state);
  });

  it("carries a car edited in the decoder back to the calculator", () => {
    // Editing the vehicle from the quote screen must update the parent, or
    // the two tools drift apart again.
    const spec = newQuoteSpec();
    let lease: Lease = { ...leaseWithCar(), quotes: [spec] };
    const edited = { ...leaseToQuote(lease, spec), vehiclePrice: 81_500, fuelType: "petrol" as const };
    lease = applyQuoteEdit(lease, spec.id, edited);

    expect(lease.vehicle.price).toBe(81_500);
    expect(lease.vehicle.fuelType).toBe("petrol");
    expect(leaseToInputs(lease).vehiclePrice).toBe(81_500);
    expect(leaseToInputs(lease).fuelType).toBe("petrol");
  });

  it("writes a quote's own figures to the quote, not the car", () => {
    const spec = newQuoteSpec();
    let lease: Lease = { ...leaseWithCar(), quotes: [spec] };
    const edited = { ...leaseToQuote(lease, spec), residualIncGst: 21_000, termMonths: 48 };
    lease = applyQuoteEdit(lease, spec.id, edited);

    expect(lease.quotes[0].residualIncGst).toBe(21_000);
    expect(lease.quotes[0].termMonths).toBe(48);
    // …and the scenario's own term is untouched by a quote's term.
    expect(lease.scenario.termYears).toBe(newLease().scenario.termYears);
  });

  it("leaves other quotes alone when one is edited", () => {
    const a = newQuoteSpec("A");
    const b = newQuoteSpec("B");
    let lease: Lease = { ...leaseWithCar(), quotes: [a, b] };
    lease = applyQuoteEdit(lease, a.id, { ...leaseToQuote(lease, a), termMonths: 36 });
    expect(lease.quotes[0].termMonths).toBe(36);
    expect(lease.quotes[1].termMonths).toBe(b.termMonths);
  });

  it("produces something both engines can actually run", () => {
    const spec = newQuoteSpec();
    const lease: Lease = {
      ...leaseWithCar(),
      quotes: [{ ...spec, amountFinanced: 65_666, residualIncGst: 20_318, lines: { finance: 600 } }],
    };
    const r = calculateLease(leaseToInputs(lease), config);
    expect(Number.isFinite(r.package.netAnnualCost)).toBe(true);
    const d = decodeQuote(leaseToQuote(lease, lease.quotes[0]), config);
    expect(d.impliedRatePct).not.toBeNull();
  });
});

describe("Reading stored leases", () => {
  it("round-trips a lease through JSON", () => {
    const lease = { ...leaseWithCar(), quotes: [newQuoteSpec("A")] };
    const back = migrateLease(JSON.parse(JSON.stringify(lease)));
    expect(back.vehicle).toEqual(lease.vehicle);
    expect(back.quotes).toHaveLength(1);
  });

  it("fills gaps in a partial lease rather than failing", () => {
    const back = migrateLease({ vehicle: { fuelType: "petrol" } });
    expect(back.vehicle.fuelType).toBe("petrol");
    expect(back.scenario.salary).toBeGreaterThan(0);
    expect(back.quotes).toEqual([]);
    expect(back.name).toBeTruthy();
  });

  it("returns a fresh lease for anything unusable", () => {
    for (const junk of [null, undefined, 42, "nope", {}]) {
      const back = migrateLease(junk);
      expect(back.version).toBe(1);
      expect(back.quotes).toEqual([]);
    }
  });

  it("drops quote entries with no id rather than carrying broken ones", () => {
    const back = migrateLease({
      vehicle: { fuelType: "electric" },
      scenario: {},
      quotes: [newQuoteSpec("ok"), { label: "broken" }],
    });
    expect(back.quotes).toHaveLength(1);
    expect(back.quotes[0].label).toBe("ok");
  });
});

describe("Quote status", () => {
  const base = (): Lease => ({ ...leaseWithCar(), quotes: [] });

  it("calls an untouched quote new", () => {
    const spec = newQuoteSpec("Fresh");
    const lease = { ...base(), quotes: [spec] };
    expect(quoteStatus(lease, spec, config)).toBe("new");
  });

  it("calls a partly-filled quote in progress", () => {
    // Something entered, but not enough to recover the rate.
    const spec = { ...newQuoteSpec(), lines: { insurance: 110 } };
    const lease = { ...base(), quotes: [spec] };
    expect(quoteStatus(lease, spec, config)).toBe("in-progress");
  });

  it("calls a quote complete once the rate can be solved", () => {
    // Complete means the tool can do its job, not that every box is filled.
    const spec = {
      ...newQuoteSpec(),
      amountFinanced: 65_666,
      residualIncGst: 20_318,
      termMonths: 60,
      lines: { finance: 600 },
    };
    const lease = { ...base(), quotes: [spec] };
    expect(quoteStatus(lease, spec, config)).toBe("complete");
  });

  it("goes back to in progress if a figure needed for the rate is removed", () => {
    const spec = {
      ...newQuoteSpec(),
      amountFinanced: 65_666,
      residualIncGst: 20_318,
      lines: { finance: 600 },
    };
    const lease = { ...base(), quotes: [spec] };
    expect(quoteStatus(lease, spec, config)).toBe("complete");
    const broken = { ...spec, lines: {} };
    expect(quoteStatus({ ...base(), quotes: [broken] }, broken, config)).toBe("in-progress");
  });

  it("stamps a created date on every new quote", () => {
    const spec = newQuoteSpec("Dated");
    expect(spec.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(spec.createdAt!))).toBe(false);
  });

  it("gives a date to quotes stored before created dates existed", () => {
    const when = "2026-04-01T00:00:00.000Z";
    const back = migrateLease({
      vehicle: { fuelType: "electric" },
      scenario: {},
      quotes: [{ id: "q1", label: "Old", frequency: "monthly", termMonths: 60, lines: {}, updatedAt: when }],
    });
    expect(back.quotes[0].createdAt).toBe(when);
  });
});
