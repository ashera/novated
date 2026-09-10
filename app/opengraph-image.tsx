import { renderOgCard, ogSize, ogContentType } from "@/lib/ogCard";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = ogSize;
export const contentType = ogContentType;

// Branded 1200×630 card used for link previews (og:image + twitter:image).
export default function OgImage() {
  return renderOgCard(
    "Novated leasing, explained",
    "What would a novated lease actually cost you?",
  );
}
