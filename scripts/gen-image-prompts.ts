// Writes docs/vehicle-image-prompts.md — one generation prompt per vehicle in
// the code catalogue, from the shared template in lib/au/vehicleImagePrompt.ts
// so the whole set comes back looking like a set.
//
//   npx tsx scripts/gen-image-prompts.ts
//
// Re-run after adding vehicles to lib/au/vehicles.ts. Anything an admin has
// added through /admin/vehicles isn't here — the editor shows that one's
// prompt on the spot, which is the point of it.
import { writeFileSync } from "node:fs";
import { VEHICLES } from "../lib/au/vehicles";
import { IMAGE_SPEC, imageFilename, vehicleImagePrompt } from "../lib/au/vehicleImagePrompt";

const lines = [
  "# Vehicle image prompts",
  "",
  `Generated from \`lib/au/vehicles.ts\` — ${VEHICLES.length} vehicles. Re-run \`npx tsx scripts/gen-image-prompts.ts\` after adding to the catalogue.`,
  "",
  "Every vehicle's prompt is also shown in the editor at `/admin/vehicles` — open one and",
  "press **Prompt** next to Upload. That works for vehicles added through the admin too,",
  "which this file doesn't cover.",
  "",
  "## How to use",
  "",
  `1. Generate each image with the prompt below.`,
  `2. Export as **${IMAGE_SPEC.format}**, ${IMAGE_SPEC.size}, ${IMAGE_SPEC.maxBytes}.`,
  "3. Upload at `/admin/vehicles` — the tile is labelled with the same `id` as the filename suggested here.",
  "",
  "Anything without an image falls back to a drawn silhouette, so the set can be filled in gradually.",
  "",
  "## A note on what you're generating",
  "",
  "These depict real, identifiable products. Keep them clean studio renders and avoid",
  "reproducing manufacturer badges or wordmarks where you can — the model name in our own",
  "caption identifies the car, so the artwork doesn't need to carry a logo to do its job.",
  "",
  "## Prompts",
  "",
];

for (const v of VEHICLES) {
  lines.push(
    `### ${v.make} ${v.model}`,
    "",
    `- **id / filename**: \`${imageFilename(v)}\``,
    `- **body**: ${v.bodyType} · **fuel**: ${v.fuelType}`,
    "",
    "```",
    vehicleImagePrompt(v),
    "```",
    "",
  );
}

writeFileSync("docs/vehicle-image-prompts.md", lines.join("\n"));
console.log(`wrote docs/vehicle-image-prompts.md — ${VEHICLES.length} prompts`);
