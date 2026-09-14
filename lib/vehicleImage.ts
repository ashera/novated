import sharp from "sharp";

/**
 * Make an uploaded vehicle image fit, rather than refusing it.
 *
 * The admin generates artwork from a prompt in an external image tool and
 * uploads what comes back. That used to be a size check and a rejection — "keep
 * it under 2MB" — which is advice the person cannot act on: an image model
 * takes no instruction about file size, so the only remedy was to go and find
 * another tool to shrink it with. The size was never the admin's to control.
 *
 * So the upload takes whatever the tool produced and makes it fit: oriented,
 * scaled down to a sensible width, and re-encoded as WebP. A generated studio
 * shot on a white background compresses extremely well that way, and the
 * result is routinely a tenth of the PNG that went in.
 *
 * Quality steps down rather than being guessed at once. Almost everything
 * lands inside the budget at the first quality; stepping only happens for the
 * unusual image that doesn't, and it is better to serve a slightly softer
 * picture than to hand back an error.
 */

/** What may end up in the database, and therefore in a page. */
export const MAX_STORED_BYTES = 2_000_000;

/**
 * Wider than anywhere it is drawn. The picker shows it at 352px in the narrow
 * column and up to about 800px in the wide one, so this covers a 2x display
 * with room to spare — and everything above it is bytes nobody can see.
 */
const MAX_WIDTH = 1400;

/** Tried in order, first one inside the budget wins. */
const QUALITY_STEPS = [82, 68, 55];

/** The width of last resort, if even the lowest quality is too big. */
const FALLBACK_WIDTH = 900;

export interface NormalisedImage {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
  /** What it took to fit — surfaced so the admin UI can say so. */
  quality: number;
  /** Bytes in, for reporting what the upload actually saved. */
  originalBytes: number;
}

async function encode(input: Buffer, width: number, quality: number) {
  const out = await sharp(input)
    // No argument: take the orientation from EXIF and bake it in. A phone
    // photo is not the expected input, but a sideways car would be a strange
    // thing to discover later.
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return out;
}

export async function normaliseVehicleImage(input: Buffer): Promise<NormalisedImage> {
  // Read it first, so an unreadable file fails here with something sayable
  // rather than part-way through encoding.
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("That file could not be read as an image.");
  }

  for (const quality of QUALITY_STEPS) {
    const out = await encode(input, MAX_WIDTH, quality);
    if (out.data.byteLength <= MAX_STORED_BYTES) {
      return {
        bytes: out.data,
        mime: "image/webp",
        width: out.info.width,
        height: out.info.height,
        quality,
        originalBytes: input.byteLength,
      };
    }
  }

  const out = await encode(input, FALLBACK_WIDTH, QUALITY_STEPS[QUALITY_STEPS.length - 1]);
  return {
    bytes: out.data,
    mime: "image/webp",
    width: out.info.width,
    height: out.info.height,
    quality: QUALITY_STEPS[QUALITY_STEPS.length - 1],
    originalBytes: input.byteLength,
  };
}
