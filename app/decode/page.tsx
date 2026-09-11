import type { Metadata } from "next";
import { headers } from "next/headers";
import QuoteDecoder from "@/components/QuoteDecoder";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
import { getCatalogue } from "@/lib/catalogue";
import { listApprovedProviders } from "@/app/actions/providers";

/**
 * The decoder is a step in the journey, not a door into it.
 *
 * The site has one entry point — the calculator — and this page is opened from
 * there, with a lease and usually a car already defined. So it is noindex: a
 * search result landing someone here cold would drop them into the middle of a
 * flow, holding a form for a quote they may not have. Links out are still
 * followed, and the page stays perfectly reachable by URL, because the
 * calculator links to it and people refresh and bookmark.
 */
export const metadata: Metadata = {
  title: "Decode your novated lease quote",
  description:
    "Paste the figures from a novated lease quote and see the interest rate the provider didn't print, whether the running-cost budgets are padded, how the fees compare with the market, and whether their own numbers add up.",
  robots: { index: false, follow: true },
};

export default async function DecodePage() {
  const user = await getCurrentUser();
  const config = await getActiveConfig();
  const catalogue = await getCatalogue();
  const providers = await listApprovedProviders();
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;

  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }

  return (
    <>
      {!user && <VisitorActivity />}
      <QuoteDecoder
        catalogue={catalogue}
        providers={providers}
        user={
          user
            ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url }
            : null
        }
        country={country}
        config={config}
        reviewDue={reviewDue}
      />
    </>
  );
}
