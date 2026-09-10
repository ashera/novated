import type { Metadata } from "next";
import { headers } from "next/headers";
import QuoteComparison from "@/components/QuoteComparison";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";

// Per-user: what's on this page is whatever quotes you have kept.
export const metadata: Metadata = {
  title: "Compare your quotes",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await getCurrentUser();
  const config = await getActiveConfig();
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;

  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }

  return (
    <QuoteComparison
      user={
        user
          ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url }
          : null
      }
      country={country}
      config={config}
      reviewDue={reviewDue}
    />
  );
}
