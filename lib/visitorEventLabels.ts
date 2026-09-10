// Turn raw analytics event names (+ their props) into plain-language descriptions
// for the visitor activity timeline. Pure so it's easily unit-tested. Page views are
// handled separately in the modal ("Viewed <page>").

type Props = Record<string, unknown> | null | undefined;

function str(p: Props, k: string): string | null {
  const v = p?.[k];
  return v == null || v === "" ? null : String(v);
}

function humanize(event: string): string {
  const t = event.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : event;
}

// Friendly description per known event. A function may fold props into the text.
const DESCRIBERS: Record<string, string | ((p: Props) => string)> = {
  "Lease priced": (p) => {
    const price = str(p, "price");
    const fuel = str(p, "fuel");
    const term = str(p, "term");
    const car = price ? `a $${Number(price).toLocaleString("en-AU")}` : "a";
    return `Priced ${car} ${fuel ?? ""} lease${term ? ` over ${term} years` : ""}`.replace(/\s+/g, " ");
  },
  "Salary entered": "Entered their salary",
  "Fuel type changed": (p) => {
    const fuel = str(p, "fuel");
    return fuel ? `Switched the car to ${fuel}` : "Changed the fuel type";
  },
  "Running costs toggled": (p) =>
    str(p, "included") === "true" ? "Packaged the running costs" : "Un-packaged the running costs",
  "FBT method changed": (p) => {
    const m = str(p, "method");
    return m === "ecm"
      ? "Chose the employee contribution method"
      : "Chose to have the employer pay the FBT";
  },
  "Comparison viewed": "Compared the lease against buying",
  "Report printed": "Printed the lease report",
  "Scenario saved": "Saved a scenario",
  "Scenario shared": "Created a share link",
  "Shared scenario viewed": "Opened a shared scenario link",
  "How it works viewed": "Read how a novated lease works",
  "FAQ opened": (p) => {
    const q = str(p, "question");
    return q ? `Opened the FAQ: ${q}` : "Opened an FAQ answer";
  },
};

export interface EventDescription {
  label: string;
  /** Whether to still surface the raw props line (true only for unmapped events, so
   *  nothing is lost for events we haven't given a friendly description yet). */
  keepProps: boolean;
}

export function describeVisitorEvent(event: string, props: Props): EventDescription {
  const d = DESCRIBERS[event];
  if (typeof d === "function") return { label: d(props), keepProps: false };
  if (typeof d === "string") return { label: d, keepProps: false };
  return { label: humanize(event), keepProps: true };
}
