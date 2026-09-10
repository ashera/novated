import { describe, it, expect } from "vitest";
import { describeVisitorEvent } from "../lib/visitorEventLabels";

describe("Visitor activity labels", () => {
  it("gives a friendly, prop-aware label for known events", () => {
    expect(describeVisitorEvent("Lease priced", { price: 55000, fuel: "electric", term: 5 }).label).toBe(
      "Priced a $55,000 electric lease over 5 years",
    );
    expect(describeVisitorEvent("Fuel type changed", { fuel: "petrol" }).label).toBe(
      "Switched the car to petrol",
    );
    expect(describeVisitorEvent("FBT method changed", { method: "ecm" }).label).toBe(
      "Chose the employee contribution method",
    );
    expect(describeVisitorEvent("Report printed", null).label).toBe("Printed the lease report");
  });

  it("falls back gracefully when a prop is missing", () => {
    expect(describeVisitorEvent("Fuel type changed", null).label).toBe("Changed the fuel type");
  });

  it("folds props into the label and hides the raw props line for known events", () => {
    expect(describeVisitorEvent("Lease priced", { price: 40000 }).keepProps).toBe(false);
  });

  it("humanises an unmapped event and keeps its raw props", () => {
    const d = describeVisitorEvent("some_new_event", { a: 1 });
    expect(d.label).toBe("Some new event");
    expect(d.keepProps).toBe(true);
  });
});
