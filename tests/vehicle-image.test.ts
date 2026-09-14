import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normaliseVehicleImage, MAX_STORED_BYTES } from "@/lib/vehicleImage";

/**
 * An image that genuinely cannot be compressed.
 *
 * The first version of this used a repeating pattern, and a 3000px PNG of it
 * came out at 206KB — so the "too big" case was never too big and the budget
 * assertion passed without testing anything. xorshift gives bytes with no
 * structure for PNG to find, which is the only way to be sure the input is
 * actually over the limit before the code under test runs.
 */
async function noise(width: number, height = width): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let x = 123456789;
  for (let i = 0; i < raw.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    raw[i] = x & 255;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

describe("Artwork uploaded for a vehicle", () => {
  it("brings an oversized render inside the budget", async () => {
    const big = await noise(1600);
    expect(big.byteLength).toBeGreaterThan(MAX_STORED_BYTES);

    const out = await normaliseVehicleImage(big);
    expect(out.bytes.byteLength).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(out.originalBytes).toBe(big.byteLength);
  }, 60_000);

  // The hard case: incompressible at any quality, so the step-down runs all
  // the way and the fallback width has to do the rest.
  it("still fits when the image resists compression entirely", async () => {
    const out = await normaliseVehicleImage(await noise(2400));
    expect(out.bytes.byteLength).toBeLessThanOrEqual(MAX_STORED_BYTES);
  }, 60_000);

  it("caps the width rather than storing pixels nobody can see", async () => {
    const out = await normaliseVehicleImage(await noise(1600));
    expect(out.width).toBeLessThanOrEqual(1400);
  }, 60_000);

  it("does not enlarge something already small", async () => {
    const out = await normaliseVehicleImage(await noise(600, 400));
    expect(out.width).toBe(600);
    expect(out.height).toBe(400);
  }, 30_000);

  it("keeps the shape it was given", async () => {
    const out = await normaliseVehicleImage(await noise(1200, 800));
    expect(out.width / out.height).toBeCloseTo(1.5, 2);
  }, 30_000);

  // Stored as WebP whatever arrives, so the served content-type is one value
  // rather than whatever an image tool happened to emit.
  it.each(["png", "jpeg", "webp"] as const)("accepts %s and stores WebP", async (format) => {
    const input = await sharp(await noise(800))
      [format]()
      .toBuffer();
    const out = await normaliseVehicleImage(input);
    expect(out.mime).toBe("image/webp");
    expect(out.bytes.byteLength).toBeLessThanOrEqual(MAX_STORED_BYTES);
  }, 30_000);

  it("reads back as an image, at the size it claims", async () => {
    const out = await normaliseVehicleImage(await noise(1000));
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(out.width);
    expect(meta.height).toBe(out.height);
  }, 30_000);

  it("fails with something sayable when the file is not an image", async () => {
    await expect(normaliseVehicleImage(Buffer.from("this is not a picture"))).rejects.toThrow();
  });
});
