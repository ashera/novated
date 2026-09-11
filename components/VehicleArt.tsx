"use client";

import { useState } from "react";
import CarProfile, { BODY_SHAPES } from "./CarProfile";

/**
 * The picture of a car, wherever one is shown.
 *
 * Three stages, each a fallback for the one before:
 *
 *   1. the artwork uploaded for that vehicle, served from the database
 *   2. a photograph of a car under a cover — the right answer for "we don't
 *      have a picture of this one yet", because it reads as a real car
 *      awaiting reveal rather than as a missing asset
 *   3. the drawn silhouette, if the placeholder file itself isn't there
 *
 * The third stage exists so the catalogue never shows a broken frame: the
 * placeholder is a static file, and a deploy that forgot it would otherwise
 * put an empty box at the top of every page.
 */

export const PLACEHOLDER_SRC = "/vehicle-placeholder.jpg";

export default function VehicleArt({
  src,
  alt,
  bodyType,
  className = "h-full w-full object-contain",
}: {
  /** The uploaded artwork, or null when there is none. */
  src?: string | null;
  alt: string;
  /** Picks the silhouette's shape at the last stage. */
  bodyType?: string;
  className?: string;
}) {
  // The stage is remembered against the src it belongs to, and reset by
  // comparing during render rather than in an effect. An effect was wrong:
  // a 404 that resolves from cache fires onError before effects flush, so
  // the mount effect put the stage back to the image that had just failed
  // and the frame stayed broken.
  const key = src ?? null;
  const [state, setState] = useState<{ key: string | null; stage: 0 | 1 | 2 }>({
    key,
    stage: src ? 0 : 1,
  });
  const stage = state.key === key ? state.stage : src ? 0 : 1;
  const fallBack = () => setState({ key, stage: stage === 0 ? 1 : 2 });

  // onError alone is not enough. This markup is server-rendered, so an image
  // can finish failing before React has attached any handler — the error
  // event is long gone by hydration and the frame keeps a broken image. A
  // loaded-but-zero-width image is one that already failed, so check on mount
  // as well as listening.
  const checkOnMount = (el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth === 0) fallBack();
  };

  if (stage === 2) {
    return (
      <CarProfile
        shape={BODY_SHAPES[(bodyType as keyof typeof BODY_SHAPES) ?? "SUV"] ?? BODY_SHAPES.SUV}
        colour={bodyType ? "#5b6b7f" : "#b3b9c4"}
        title={alt}
        className={`${className} text-ink`}
      />
    );
  }

  const isPlaceholder = stage === 1;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isPlaceholder ? PLACEHOLDER_SRC : src!}
      // The placeholder is not a picture of this car, so it is decorative —
      // the name is always in the caption beside it.
      alt={isPlaceholder ? "" : alt}
      title={isPlaceholder ? "No photo of this one yet" : undefined}
      className={className}
      ref={checkOnMount}
      onError={fallBack}
    />
  );
}
