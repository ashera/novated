/**
 * An original, parametric car profile.
 *
 * Drawn rather than photographed, for three reasons: no licensing question, no
 * dependency that can go down or start watermarking, and something to render
 * for the many vehicles no photo library covers.
 *
 * It is honest about what it is. A silhouette cannot tell a Model Y from an
 * Atto 3 — mid-size electric SUVs genuinely share a shape, and the parts that
 * distinguish them (grille, light signature, badge) are both the hardest to
 * draw and the closest to a manufacturer's protected trade dress. What it can
 * do is show the right KIND of car in the right colour: a ute reads as a ute,
 * a Prado sits taller and boxier than a CX-30, and the page stops being a wall
 * of numbers about an abstraction.
 *
 * Everything is derived from a handful of measurements, so a new vehicle is a
 * row of numbers rather than new path data.
 */

export type RearShape = "fastback" | "hatch" | "notch" | "wagon" | "tray" | "van";

export interface CarShape {
  /** Roof height above the ground. Taller = more SUV. */
  roof: number;
  /** Depth of the glasshouse, roofline down to the window sills. */
  glass: number;
  /** Ground clearance under the body. */
  clear: number;
  /** Wheel radius. */
  wheel: number;
  /** Bonnet length, from the front bumper to the base of the windscreen. */
  nose: number;
  /** Cabin length along the roof. */
  cabin: number;
  rear: RearShape;
}

const GROUND = 100;
const FRONT = 14;
const REAR = 246;

/** Sensible proportions per body type; a vehicle may nudge any of them. */
export const BODY_SHAPES: Record<string, CarShape> = {
  SUV: { roof: 62, glass: 20, clear: 14, wheel: 19, nose: 62, cabin: 74, rear: "wagon" },
  Hatch: { roof: 52, glass: 18, clear: 9, wheel: 16, nose: 58, cabin: 66, rear: "hatch" },
  Sedan: { roof: 50, glass: 17, clear: 8, wheel: 17, nose: 66, cabin: 72, rear: "notch" },
  Wagon: { roof: 55, glass: 18, clear: 10, wheel: 17, nose: 64, cabin: 84, rear: "wagon" },
  Ute: { roof: 60, glass: 19, clear: 16, wheel: 20, nose: 66, cabin: 56, rear: "tray" },
  "People mover": { roof: 68, glass: 22, clear: 11, wheel: 17, nose: 46, cabin: 96, rear: "van" },
};

function outline(s: CarShape): string {
  const bottom = GROUND - s.clear;
  const roofY = GROUND - s.roof;
  const beltY = roofY + s.glass;
  const bonnetY = beltY + 4;

  const fwX = FRONT + 42;
  const rwX = s.rear === "tray" ? REAR - 52 : REAR - 44;
  const archR = s.wheel + 4;

  const wsBase = FRONT + s.nose; // base of the windscreen
  const roofF = wsBase + 24; // top of the windscreen (rake)
  const roofR = Math.min(roofF + s.cabin, REAR - 6);

  // Front: bumper up over the bonnet to the windscreen.
  const front =
    `M ${FRONT} ${bottom}` +
    ` L ${FRONT} ${bonnetY + 8}` +
    ` Q ${FRONT} ${bonnetY} ${FRONT + 12} ${bonnetY - 1}` +
    ` L ${wsBase} ${bonnetY - 3}`;

  // Cabin: windscreen, roof.
  const cabin = ` L ${roofF} ${roofY} L ${roofR} ${roofY}`;

  // Rear: the part that actually distinguishes one body type from another.
  let tail: string;
  switch (s.rear) {
    case "fastback":
      tail = ` C ${roofR + 34} ${roofY + 4} ${REAR - 10} ${beltY + 6} ${REAR - 2} ${bottom - 6} L ${REAR} ${bottom}`;
      break;
    case "hatch":
      tail = ` L ${REAR - 10} ${beltY - 1} Q ${REAR} ${beltY + 6} ${REAR} ${bottom}`;
      break;
    case "notch":
      tail = ` L ${REAR - 36} ${beltY + 1} L ${REAR - 6} ${beltY + 3} L ${REAR} ${beltY + 8} L ${REAR} ${bottom}`;
      break;
    case "wagon":
      tail = ` L ${REAR - 6} ${beltY - 6} L ${REAR} ${beltY + 2} L ${REAR} ${bottom}`;
      break;
    case "van":
      tail = ` L ${REAR - 4} ${roofY + 6} L ${REAR} ${beltY} L ${REAR} ${bottom}`;
      break;
    case "tray":
    default:
      // Cab drops to a flat tray, which is the whole point of a ute.
      tail =
        ` L ${roofR + 8} ${beltY + 2}` +
        ` L ${roofR + 12} ${beltY + 9}` +
        ` L ${REAR} ${beltY + 9}` +
        ` L ${REAR} ${bottom}`;
      break;
  }

  // Underside, cut by the two wheel arches.
  const under =
    ` L ${rwX + archR} ${bottom}` +
    ` A ${archR} ${archR} 0 0 0 ${rwX - archR} ${bottom}` +
    ` L ${fwX + archR} ${bottom}` +
    ` A ${archR} ${archR} 0 0 0 ${fwX - archR} ${bottom}` +
    ` Z`;

  return front + cabin + tail + under;
}

/** The glasshouse, inset so it reads as glass rather than a hole. */
function glasshouse(s: CarShape): { front: string; rear: string } {
  const roofY = GROUND - s.roof;
  const beltY = roofY + s.glass;
  const wsBase = FRONT + s.nose;
  const roofF = wsBase + 24;
  const roofR = Math.min(roofF + s.cabin, REAR - 6);
  const pillar = roofF + (roofR - roofF) * 0.42;
  const top = roofY + 5;
  const sill = beltY - 4;

  const frontGlass =
    `M ${wsBase + 7} ${sill} L ${roofF + 5} ${top} L ${pillar - 3} ${top} L ${pillar - 3} ${sill} Z`;

  // A ute's rear glass is a small back window; everything else gets a proper one.
  const rearEnd = s.rear === "tray" ? roofR - 3 : Math.min(roofR - 5, REAR - 16);
  const rearGlass =
    `M ${pillar + 3} ${sill} L ${pillar + 3} ${top} L ${rearEnd} ${top}` +
    (s.rear === "notch" || s.rear === "fastback"
      ? ` L ${rearEnd + 8} ${sill} Z`
      : ` L ${rearEnd + 3} ${sill} Z`);

  return { front: frontGlass, rear: rearGlass };
}

export default function CarProfile({
  shape,
  colour = "#5b6b7f",
  className = "",
  title,
}: {
  shape: CarShape;
  /** Body colour. Everything else derives from the theme. */
  colour?: string;
  className?: string;
  title?: string;
}) {
  const s = shape;
  const bottom = GROUND - s.clear;
  const roofY = GROUND - s.roof;
  const beltY = roofY + s.glass;
  const fwX = FRONT + 42;
  const rwX = s.rear === "tray" ? REAR - 52 : REAR - 44;
  const wheelCy = GROUND - s.wheel;
  const glass = glasshouse(s);
  const wsBase = FRONT + s.nose;
  const roofF = wsBase + 24;
  const roofR = Math.min(roofF + s.cabin, REAR - 6);
  const pillar = roofF + (roofR - roofF) * 0.42;

  return (
    <svg
      viewBox="0 0 260 120"
      className={className}
      role="img"
      aria-label={title ?? "Car"}
      preserveAspectRatio="xMidYMid meet"
    >
      {title && <title>{title}</title>}

      {/* Contact shadow, so the car sits on something */}
      <ellipse cx="130" cy="103" rx="112" ry="6" fill="currentColor" opacity="0.1" />

      {/* Body */}
      <path d={outline(s)} fill={colour} />
      {/* A soft highlight along the flank — the one thing that stops it reading flat */}
      <path
        d={`M ${FRONT + 16} ${beltY + 6} L ${REAR - 24} ${beltY + 6}`}
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* Glass */}
      <path d={glass.front} fill="#0b1a2b" fillOpacity="0.55" />
      <path d={glass.rear} fill="#0b1a2b" fillOpacity="0.55" />

      {/* Shut lines: B-pillar down to the sill, and a door edge */}
      <path
        d={`M ${pillar} ${beltY - 3} L ${pillar} ${bottom - 6}`}
        stroke="#000"
        strokeOpacity="0.18"
        strokeWidth="1.6"
      />
      <path
        d={`M ${wsBase + 6} ${beltY - 2} L ${wsBase + 6} ${bottom - 8}`}
        stroke="#000"
        strokeOpacity="0.12"
        strokeWidth="1.4"
      />
      {/* Door handle */}
      <rect x={pillar - 16} y={beltY + 2} width="9" height="2.6" rx="1.3" fill="#000" fillOpacity="0.25" />

      {/* Lights */}
      <rect x={FRONT + 2} y={beltY + 2} width="13" height="6" rx="2.5" fill="#ffe9b0" fillOpacity="0.92" />
      <rect x={REAR - 13} y={beltY + 3} width="10" height="6" rx="2" fill="#e5484d" fillOpacity="0.85" />

      {/* Wheels */}
      {[fwX, rwX].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={wheelCy} r={s.wheel} fill="#1d2125" />
          <circle cx={cx} cy={wheelCy} r={s.wheel * 0.55} fill="#c7d1db" />
          <circle cx={cx} cy={wheelCy} r={s.wheel * 0.22} fill="#8696a7" />
        </g>
      ))}
    </svg>
  );
}
