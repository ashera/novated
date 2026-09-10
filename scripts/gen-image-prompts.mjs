// Writes docs/vehicle-image-prompts.md — one generation prompt per vehicle in
// the catalogue, from a single shared template so the whole set comes back
// looking like a set. Re-run after adding vehicles.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("lib/au/vehicles.ts", "utf8");
const rows = [...src.matchAll(
  /\{\s*id:\s*"([^"]+)",\s*make:\s*"([^"]+)",\s*model:\s*"([^"]+)",\s*fuelType:\s*"([^"]+)",\s*consumption:\s*([\d.]+),\s*bodyType:\s*"([^"]+)"/g,
)].map((m) => ({ id: m[1], make: m[2], model: m[3], fuelType: m[4], bodyType: m[6] }));

// One template, so lighting, angle and framing match across all of them. A set
// that varies in angle looks broken next to itself.
const STYLE =
  "three-quarter front view facing left, centred, entire vehicle in frame with a small margin, " +
  "pure white seamless studio background, soft even lighting from above, subtle contact shadow beneath the wheels, " +
  "photorealistic product photography, no people, no text, no logos overlaid, no watermark, no background objects";

const lines = [
  "# Vehicle image prompts",
  "",
  `Generated from \`lib/au/vehicles.ts\` — ${rows.length} vehicles. Re-run \`node scripts/gen-image-prompts.mjs\` after adding to the catalogue.`,
  "",
  "## How to use",
  "",
  "1. Generate each image with the prompt below.",
  "2. Export as **WebP** (or PNG), roughly **1200×800**, under 2MB.",
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

for (const v of rows) {
  const era = v.fuelType === "electric" ? "modern electric " : "modern ";
  lines.push(
    `### ${v.make} ${v.model}`,
    "",
    `- **id / filename**: \`${v.id}.webp\``,
    `- **body**: ${v.bodyType} · **fuel**: ${v.fuelType}`,
    "",
    "```",
    `A ${era}${v.make} ${v.model}, a ${v.bodyType.toLowerCase()}, in silver-grey metallic paint. ${STYLE}.`,
    "```",
    "",
  );
}

writeFileSync("docs/vehicle-image-prompts.md", lines.join("\n"));
console.log(`wrote docs/vehicle-image-prompts.md — ${rows.length} prompts`);
