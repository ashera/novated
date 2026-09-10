import { ImageResponse } from "next/og";
import { SITE_NAME } from "./site";

// Shared 1200×630 OG-card renderer for per-page link previews — a branded header,
// an eyebrow (section/category) and the page title. Used by the per-segment
// opengraph-image.tsx routes so each page gets its own card.
//
// Drawn entirely with layout primitives: Satori has no SVG-file or remote-image
// support to rely on, and an inline mark can never go missing from the deploy.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const BRAND = "#0c66e4";
const INK = "#172b4d";
const SUBTLE = "#44546f";

/** The logo lockup: a brand-blue rounded square with the initial, plus the wordmark. */
export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: BRAND,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 38,
          fontWeight: 700,
        }}
      >
        {SITE_NAME.slice(0, 1)}
      </div>
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: INK }}>{SITE_NAME}</div>
    </div>
  );
}

export function renderOgCard(eyebrow: string, title: string) {
  const titleSize = title.length > 70 ? 46 : title.length > 45 ? 54 : 64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <OgBrand />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: BRAND,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, color: INK, lineHeight: 1.15 }}>
            {title}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: SUBTLE }}>
          General information only — not financial or tax advice
        </div>
        {/* Brand rule along the bottom edge */}
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: BRAND }} />
      </div>
    ),
    { ...ogSize },
  );
}
