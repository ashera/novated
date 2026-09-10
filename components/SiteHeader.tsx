import { headers } from "next/headers";
import TopBar from "./TopBar";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { buildReviewData } from "@/lib/refdata";

/**
 * Server wrapper around <TopBar> for the content pages, so every page in the
 * product wears the same shell without each one re-deriving the session, the
 * visitor's country and the admin review badge.
 */
export default async function SiteHeader() {
  const user = await getCurrentUser();
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;

  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }

  return (
    <TopBar
      user={
        user
          ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url }
          : null
      }
      country={country}
      reviewDue={reviewDue}
    />
  );
}
