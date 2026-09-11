// The prompt for generating one vehicle's artwork.
//
// One template for the whole catalogue, because the images sit next to each
// other in a picker and a set that varies in angle, lighting or crop looks
// broken against itself. Everything here is pure text assembly — it is used
// both by the admin editor, where someone is filling in one car, and by
// scripts/gen-image-prompts.ts, which writes the whole set out at once.

import type { BodyType, Vehicle } from "./vehicles";

/** The half of the prompt that must be identical for every car. */
export const IMAGE_STYLE =
  "three-quarter front view facing left, centred, entire vehicle in frame with a small margin, " +
  "pure white seamless studio background, soft even lighting from above, subtle contact shadow beneath the wheels, " +
  "photorealistic product photography, no people, no text, no logos overlaid, no watermark, no background objects";

/** What to call each body in the prompt, article included — "a suv" reads as
 *  a mistake and an image model does nothing useful with it. */
const BODY_PHRASE: Record<BodyType, string> = {
  SUV: "an SUV",
  Hatch: "a hatchback",
  Sedan: "a sedan",
  Wagon: "a wagon",
  Ute: "a dual-cab ute",
  "People mover": "a people mover",
};

export interface PromptVehicle {
  make: string;
  model: string;
  fuelType: string;
  bodyType: string;
}

export function vehicleImagePrompt(v: PromptVehicle): string {
  const era = v.fuelType === "electric" ? "modern electric " : "modern ";
  const body = BODY_PHRASE[v.bodyType as BodyType] ?? `a ${v.bodyType.toLowerCase()}`;
  const name = `${v.make} ${v.model}`.trim();
  return `A ${era}${name}, ${body}, in silver-grey metallic paint. ${IMAGE_STYLE}.`;
}

/** What the generated file needs to be, wherever that guidance is shown. */
export const IMAGE_SPEC = {
  format: "WebP (or PNG)",
  size: "roughly 1200×800",
  maxBytes: "under 2MB",
} as const;

export const imageFilename = (v: Pick<Vehicle, "id">) => `${v.id}.webp`;
