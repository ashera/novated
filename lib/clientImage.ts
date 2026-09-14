/**
 * Shrink an image in the browser before it is uploaded.
 *
 * The server re-encodes everything anyway, so this is not about the stored
 * size — it is about what has to cross the wire to get there. A server action
 * has a body limit, and Next rejects an oversized request before any of our
 * code runs, so there is nothing to return a message from: the action simply
 * throws. Generated artwork from an image tool is routinely a 4K PNG well past
 * that limit, which made the failure both certain and silent.
 *
 * Doing it here removes the problem rather than reporting it. A 20MB PNG
 * becomes a few dozen kilobytes before it leaves the machine, the upload is
 * quick, and the body limit stops being something anyone has to think about.
 *
 * Every failure path returns the original file. This is an optimisation, not
 * a gate — an old browser, a canvas the tab is not allowed to read, an image
 * format the decoder does not know all end with the server getting exactly
 * what it would have got before, and doing its own normalisation.
 */

/** Matches the server's cap in lib/vehicleImage.ts; wider than it is ever drawn. */
const MAX_WIDTH = 1400;

export async function shrinkForUpload(file: File, maxWidth = MAX_WIDTH): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    // Not smaller is not worth swapping for — a small WebP upload would come
    // back out larger than the JPEG somebody carefully prepared.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}
