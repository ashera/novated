import { SITE_URL, SITE_NAME } from "@/lib/site";

// Shared structured-data (JSON-LD) builders, so every content page emits consistent
// BreadcrumbList + Article schema. General SEO — no runtime behaviour.

// The publisher/author org, reused as both across our first-party content. Matches the
// #organization node declared on the homepage graph.
export const ORG_LD = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
} as const;

/** BreadcrumbList from an ordered trail of { name, path } (path is site-relative). */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/** Article schema with the fields Google wants for Article rich results. */
export function articleLd(opts: {
  headline: string;
  description: string;
  path: string; // site-relative, e.g. "/learn/aged-care-costs"
  datePublished: string;
  dateModified?: string;
  section?: string;
}) {
  const url = `${SITE_URL}${opts.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url,
    mainEntityOfPage: url,
    image: `${url}/opengraph-image`, // the page's own OG card
    inLanguage: "en-AU",
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: ORG_LD,
    publisher: ORG_LD,
    ...(opts.section ? { articleSection: opts.section } : {}),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };
}
