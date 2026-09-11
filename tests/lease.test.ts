import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  applyQuoteEdit,
  leaseToInputs,
  leaseToQuote,
  migrateLease,
  newLease,
  newQuoteSpec,
  quoteLabel,
  quoteStatus,
  withLeaseVehicle,
  type Lease,
} from "@/lib/au/lease";
import { calculateLease } from "@/lib/au/novated";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { VEHICLES, findVehicle } from "@/lib/au/vehicles";

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

describe("The car survives a round trip through storage", () => {
  // The bug this guards: the vehicle read back correctly for the title but
  // the make/model controls stayed empty, because they were seeded from props
  // at first render and the lease loads asynchronously. Nothing about the
  // stored lease was wrong — so the guard belongs on what a consumer can
  // derive from it, not on the store.
  it("can recover make and model from a stored lease alone", () => {
    const lease: Lease = {
      ...leaseWithCar(),
      vehicle: { ...leaseWithCar().vehicle, vehicleId: "kia-ev6" },
    };
    const back = migrateLease(JSON.parse(JSON.stringify(lease)));
    const v = findVehicle(VEHICLES, back.vehicle.vehicleId);
    expect(v?.make).toBe("Kia");
    expect(v?.model).toBe("EV6");
  });

  it("keeps a picked vehicle through an edit made in the decoder", () => {
    const spec = newQuoteSpec();
    let lease: Lease = { ...leaseWithCar(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, {
      ...leaseToQuote(lease, spec),
      lines: { finance: 700 },
    });
    expect(lease.vehicle.vehicleId).toBe("tesla-model-y");
    expect(findVehicle(VEHICLES, lease.vehicle.vehicleId)?.make).toBe("Tesla");
  });
});

describe("Renaming a quote", () => {
  // The bug this guards: applyQuoteEdit trimmed the label on every edit, and
  // the name field reads its value back out of the lease. So the space in
  // "Maxxia offer" was stripped the instant it was typed and the next letter
  // landed against the trimmed text — the field produced "Maxxiaoffer" and
  // there was no way to type a two-word name at all.
  const renameTo = (name: string) => {
    const spec = newQuoteSpec("Quote 1");
    let lease: Lease = { ...newLease(), quotes: [spec] };
    // One keystroke at a time, exactly as the field does it.
    for (let i = 1; i <= name.length; i++) {
      lease = applyQuoteEdit(lease, spec.id, {
        ...leaseToQuote(lease, lease.quotes[0]),
        label: name.slice(0, i),
      });
    }
    return lease.quotes[0];
  };

  it("keeps the spaces someone types", () => {
    expect(renameTo("Maxxia offer").label).toBe("Maxxia offer");
  });

  it("lets the field be cleared, rather than restoring the old name", () => {
    const spec = newQuoteSpec("Quote 1");
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, {
      ...leaseToQuote(lease, spec),
      label: "",
    });
    expect(lease.quotes[0].label).toBe("");
    // ...and something sensible still shows in the list.
    expect(quoteLabel(lease.quotes[0])).toBe("Untitled quote");
  });

  it("shows the name as typed once it is finished", () => {
    expect(quoteLabel(renameTo("Maxxia offer"))).toBe("Maxxia offer");
  });
});

describe("The decoder cannot redefine the car", () => {
  // The bug this guards: the decoder's example quote is priced at $85,000 to
  // make a point. Typing the first character turned it into a real quote and
  // applyQuoteEdit wrote that price onto the lease as though the user had
  // chosen it. Harmless while the car was editable there; not harmless once
  // the decoder shows the car as settled and offers no way to correct it.
  const example = (): Quote => ({
    label: "Example quote",
    frequency: "fortnightly",
    vehiclePrice: 85_000,
    fuelType: "petrol",
    vehicleId: "ford-ranger",
    annualKm: 30_000,
    state: "QLD",
    termMonths: 60,
    lines: { finance: 700 },
  });

  it("keeps the lease's car when an edit arrives carrying a different one", () => {
    const lease = leaseWithCar(); // Tesla Model Y at 55,000
    const q = withLeaseVehicle(lease, example());
    expect(q.vehiclePrice).toBe(lease.vehicle.price);
    expect(q.vehicleId).toBe(lease.vehicle.vehicleId);
    expect(q.fuelType).toBe(lease.vehicle.fuelType);
    expect(q.annualKm).toBe(lease.vehicle.annualKm);
    expect(q.state).toBe(lease.vehicle.state);
  });

  it("leaves everything that is genuinely the quote's alone", () => {
    const q = withLeaseVehicle(leaseWithCar(), example());
    expect(q.label).toBe("Example quote");
    expect(q.lines.finance).toBe(700);
    expect(q.termMonths).toBe(60);
  });

  it("does not overlay delivery — that belongs to the quote", () => {
    const q = withLeaseVehicle(leaseWithCar(), { ...example(), firstHeldDate: "2027-02-01" });
    expect(q.firstHeldDate).toBe("2027-02-01");
  });

  it("so applying that edit leaves the lease's car untouched", () => {
    const spec = newQuoteSpec();
    let lease: Lease = { ...leaseWithCar(), quotes: [spec] };
    const before = { ...lease.vehicle };
    lease = applyQuoteEdit(lease, spec.id, withLeaseVehicle(lease, example()));
    expect(lease.vehicle).toEqual(before);
    expect(lease.quotes[0].lines.finance).toBe(700);
  });
});

describe("Which quote the calculator is showing", () => {
  // The scenario is a single set of values, so only one quote can be in force
  // at a time and handing over a second replaces the first. What must not
  // happen is the figures outliving the attribution: a rate sitting there
  // unlabelled looks like something the user chose rather than something a
  // provider quoted.
  const withQuotes = () => {
    const a = newQuoteSpec("Maxxia");
    const b = newQuoteSpec("Smartleasing");
    const lease: Lease = { ...newLease(), quotes: [a, b] };
    return { lease, a, b };
  };

  it("remembers which quote the scenario came from, across storage", () => {
    const { lease, b } = withQuotes();
    const stored: Lease = { ...lease, scenario: { ...lease.scenario, fromQuoteId: b.id } };
    const back = migrateLease(JSON.parse(JSON.stringify(stored)));
    expect(back.scenario.fromQuoteId).toBe(b.id);
    expect(back.quotes.find((q) => q.id === back.scenario.fromQuoteId)?.label).toBe(
      "Smartleasing",
    );
  });

  it("stores the id, not the label or the rate — so editing the quote updates both", () => {
    const { lease, a } = withQuotes();
    let next: Lease = { ...lease, scenario: { ...lease.scenario, fromQuoteId: a.id } };
    next = applyQuoteEdit(next, a.id, { ...leaseToQuote(next, a), label: "Maxxia (revised)" });
    expect(next.scenario.fromQuoteId).toBe(a.id);
    expect(next.quotes.find((q) => q.id === next.scenario.fromQuoteId)?.label).toBe(
      "Maxxia (revised)",
    );
  });

  it("is simply absent on a lease nobody has handed a quote to", () => {
    expect(newLease().scenario.fromQuoteId).toBeUndefined();
    expect(migrateLease(JSON.parse(JSON.stringify(newLease()))).scenario.fromQuoteId).toBeUndefined();
  });

  it("survives a quote being deleted, pointing at nothing rather than the wrong one", () => {
    const { lease, a, b } = withQuotes();
    const pinned: Lease = { ...lease, scenario: { ...lease.scenario, fromQuoteId: a.id } };
    const afterDelete: Lease = { ...pinned, quotes: pinned.quotes.filter((q) => q.id !== a.id) };
    expect(afterDelete.quotes.find((q) => q.id === afterDelete.scenario.fromQuoteId)).toBeUndefined();
    expect(afterDelete.quotes[0].id).toBe(b.id);
  });
});
