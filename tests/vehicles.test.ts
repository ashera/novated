import { describe, it, expect } from "vitest";
import { VEHICLES, findVehicle, vehicleMakes, vehiclesForMake } from "@/lib/au/vehicles";

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
    const makes = vehicleMakes();
    for (const m of ["Tesla", "BYD", "Kia", "Hyundai", "Toyota", "MG"]) {
      expect(makes, `${m} missing`).toContain(m);
    }
  });

  it("looks a vehicle up by id, and shrugs at an unknown one", () => {
    expect(findVehicle("tesla-model-y")?.model).toBe("Model Y");
    expect(findVehicle("nope")).toBeNull();
    expect(findVehicle(undefined)).toBeNull();
  });

  it("lists models for a make, sorted, and nothing for an unknown make", () => {
    const byd = vehiclesForMake("BYD");
    expect(byd.length).toBeGreaterThan(2);
    expect(byd.every((v) => v.make === "BYD")).toBe(true);
    expect([...byd].sort((a, b) => a.model.localeCompare(b.model))).toEqual(byd);
    expect(vehiclesForMake("Lada")).toEqual([]);
  });
});
