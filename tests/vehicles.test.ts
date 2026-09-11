import { describe, it, expect } from "vitest";
import {
  BODY_TYPES,
  CONSUMPTION_RANGE,
  VEHICLES,
  findVehicle,
  validateVehicle,
  vehicleMakes,
  vehicleSlug,
  vehiclesForMake,
} from "@/lib/au/vehicles";
import { IMAGE_STYLE, imageFilename, vehicleImagePrompt } from "@/lib/au/vehicleImagePrompt";

describe("Vehicle catalogue", () => {
  it("gives every vehicle a unique id", () => {
    const ids = VEHICLES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no price — that is the dealer's to set, not ours", () => {
    for (const v of VEHICLES) {
      expect(Object.keys(v)).not.toContain("price");
    }
  });

  it("states a plausible consumption in the right unit for the fuel type", () => {
    for (const v of VEHICLES) {
      if (v.fuelType === "electric") {
        // kWh/100km — a passenger EV sits well inside this.
        expect(v.consumption, `${v.id}`).toBeGreaterThan(10);
        expect(v.consumption, `${v.id}`).toBeLessThan(30);
      } else if (v.fuelType === "phev") {
        // Plug-in hybrids quote a very low combined figure by design.
        expect(v.consumption, `${v.id}`).toBeLessThan(4);
      } else {
        expect(v.consumption, `${v.id}`).toBeGreaterThan(3);
        expect(v.consumption, `${v.id}`).toBeLessThan(20);
      }
    }
  });

  it("covers the makes that dominate Australian novated leasing", () => {
    const makes = vehicleMakes(VEHICLES);
    for (const m of ["Tesla", "BYD", "Kia", "Hyundai", "Toyota", "MG"]) {
      expect(makes, `${m} missing`).toContain(m);
    }
  });

  it("looks a vehicle up by id, and shrugs at an unknown one", () => {
    expect(findVehicle(VEHICLES, "tesla-model-y")?.model).toBe("Model Y");
    expect(findVehicle(VEHICLES, "nope")).toBeNull();
    expect(findVehicle(VEHICLES, undefined)).toBeNull();
  });

  it("lists models for a make, sorted, and nothing for an unknown make", () => {
    const byd = vehiclesForMake(VEHICLES, "BYD");
    expect(byd.length).toBeGreaterThan(2);
    expect(byd.every((v) => v.make === "BYD")).toBe(true);
    expect([...byd].sort((a, b) => a.model.localeCompare(b.model))).toEqual(byd);
    expect(vehiclesForMake(VEHICLES, "Lada")).toEqual([]);
  });
});

describe("Editing the vehicle catalogue", () => {
  const good = { make: "Kia", model: "EV3", fuelType: "electric", consumption: 15.2, bodyType: "SUV" };

  it("accepts a sound vehicle and derives its id", () => {
    const r = validateVehicle(good);
    expect(r.ok && r.vehicle.id).toBe("kia-ev3");
    expect(r.ok && r.vehicle.make).toBe("Kia");
  });

  it("trims what was typed, rather than storing the whitespace", () => {
    const r = validateVehicle({ ...good, make: "  Kia  ", model: " EV3 " });
    expect(r.ok && r.vehicle.make).toBe("Kia");
    expect(r.ok && r.vehicle.model).toBe("EV3");
  });

  it("insists on a make and a model", () => {
    expect(validateVehicle({ ...good, make: "" }).ok).toBe(false);
    expect(validateVehicle({ ...good, model: "   " }).ok).toBe(false);
  });

  it("rejects a fuel or body type the engine doesn't handle", () => {
    expect(validateVehicle({ ...good, fuelType: "hydrogen" }).ok).toBe(false);
    expect(validateVehicle({ ...good, bodyType: "Convertible" }).ok).toBe(false);
  });

  // The one that matters. An EV's figure is kWh/100km and a petrol car's is
  // L/100km, so a petrol number entered against "electric" is a plausible
  // slip that would halve the running-cost budget with nothing looking wrong.
  it("catches a consumption figure in the wrong unit for the fuel type", () => {
    const r = validateVehicle({ ...good, consumption: 7.4 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("kWh/100km");
  });

  it("catches a figure that is simply a typo", () => {
    expect(validateVehicle({ ...good, consumption: 152 }).ok).toBe(false);
    expect(validateVehicle({ ...good, consumption: 0 }).ok).toBe(false);
    expect(validateVehicle({ ...good, consumption: "abc" }).ok).toBe(false);
  });

  it("allows each fuel type its own plausible range", () => {
    for (const [fuel, range] of Object.entries(CONSUMPTION_RANGE)) {
      const mid = (range.min + range.max) / 2;
      expect(validateVehicle({ ...good, fuelType: fuel, consumption: mid }).ok, fuel).toBe(true);
    }
  });

  it("rounds a consumption figure to one decimal, the way they're published", () => {
    const r = validateVehicle({ ...good, consumption: 15.239 });
    expect(r.ok && r.vehicle.consumption).toBe(15.2);
  });

  it("makes a usable id out of an awkward name", () => {
    expect(vehicleSlug("Mercedes-Benz", "EQA 250+")).toBe("mercedes-benz-eqa-250");
    expect(vehicleSlug("Smart", "#3")).toBe("smart-3");
    expect(vehicleSlug("Škoda", "Enyaq")).toBe("skoda-enyaq");
  });

  it("keeps an id that was given, rather than re-deriving it from a rename", () => {
    // A saved lease points at the id, so renaming the model must not move it.
    const r = validateVehicle({ ...good, id: "kia-ev3", model: "EV3 Air" });
    expect(r.ok && r.vehicle.id).toBe("kia-ev3");
  });

  it("refuses an id that isn't a clean slug", () => {
    expect(validateVehicle({ ...good, id: "Kia EV3" }).ok).toBe(false);
    expect(validateVehicle({ ...good, id: "kia--ev3" }).ok).toBe(false);
  });

  it("only offers body types the seed catalogue actually uses", () => {
    for (const v of VEHICLES) expect(BODY_TYPES, v.id).toContain(v.bodyType);
  });
});

describe("Vehicle image prompts", () => {
  it("names the car and its body in readable English", () => {
    expect(vehicleImagePrompt({ make: "Tesla", model: "Model Y", fuelType: "electric", bodyType: "SUV" }))
      .toContain("A modern electric Tesla Model Y, an SUV,");
  });

  // "a suv" was what the old template produced, and an image model does
  // nothing useful with it.
  it("gets the article right for every body type in the catalogue", () => {
    for (const v of VEHICLES) {
      const p = vehicleImagePrompt(v);
      expect(p, v.id).not.toMatch(/a (SUV|suv)/);
      expect(p, v.id).toMatch(/^A modern /);
    }
  });

  it("calls out electric cars, and leaves everything else alone", () => {
    const ev = vehicleImagePrompt({ make: "Kia", model: "EV6", fuelType: "electric", bodyType: "SUV" });
    const petrol = vehicleImagePrompt({ make: "Mazda", model: "CX-5", fuelType: "petrol", bodyType: "SUV" });
    expect(ev).toContain("modern electric Kia EV6");
    expect(petrol).toContain("modern Mazda CX-5");
    expect(petrol).not.toContain("electric");
  });

  // The whole set sits side by side in one picker, so the half of the prompt
  // that fixes angle, lighting and crop has to be identical on all of them.
  it("uses one style for every car", () => {
    for (const v of VEHICLES) expect(vehicleImagePrompt(v), v.id).toContain(IMAGE_STYLE);
  });

  it("suggests a filename that matches the id the upload is keyed on", () => {
    expect(imageFilename({ id: "byd-atto-3" })).toBe("byd-atto-3.webp");
  });

  it("survives a body type it has no phrase for", () => {
    expect(vehicleImagePrompt({ make: "X", model: "Y", fuelType: "petrol", bodyType: "Coupe" }))
      .toContain("a coupe");
  });
});
