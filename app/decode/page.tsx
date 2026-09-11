import type { Metadata } from "next";
import { headers } from "next/headers";
import QuoteDecoder from "@/components/QuoteDecoder";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
import { getCatalogue } from "@/lib/catalogue";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Decode your novated lease quote",
  description:
    "Paste the figures from a novated lease quote and see the interest rate the provider didn't print, whether the running-cost budgets are padded, how the fees compare with the market, and whether their own numbers add up.",
  alternates: { canonical: "/decode" },
};

export default async function DecodePage() {
  const user = await getCurrentUser();
  const config = await getActiveConfig();
  const catalogue = await getCatalogue();
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;

  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: "Decode your quote", path: "/decode" },
            ]),
          ),
        }}
      />
      {!user && <VisitorActivity />}
      <QuoteDecoder
        catalogue={catalogue}
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
