import { headers } from "next/headers";
import LeaseCalculator from "@/components/LeaseCalculator";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { getActivePlan } from "@/app/actions/plans";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
import { migrateScenario } from "@/lib/au/types";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "en-AU",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      inLanguage: "en-AU",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
      audience: { "@type": "Audience", geographicArea: { "@type": "Country", name: "Australia" } },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default async function Page() {
  const user = await getCurrentUser();
  const [active, config] = await Promise.all([
    user ? getActivePlan() : Promise.resolve(null),
    getActiveConfig(),
  ]);
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;

  // The flag in the menu bar: a signed-in user's stored country, else the
  // anonymous visitor's country resolved from their IP.
  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {!user && <VisitorActivity />}
      <LeaseCalculator
        user={
          user
            ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url }
            : null
        }
        country={country}
        config={config}
        reviewDue={reviewDue}
        initialScenario={active ? migrateScenario(active.data) : null}
      />
    </>
  );
}
