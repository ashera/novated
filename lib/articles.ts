// The article library's index.
//
// Kept as data rather than inferred from the filesystem, because three
// separate things need to agree about what exists: the index page, the
// sitemap, and any article that wants to link to a sibling. A registry means
// adding an article is one entry plus one page, and tests/sitemap.test.ts
// already forces the second half.
//
// The library is deliberately small and will stay that way. The competitor
// publishes around forty articles; the argument for doing fewer is that every
// page here is COMPUTED — its figures come from the same engine the calculator
// uses, against the same worked example, and they move when the tax moves.
// That is a thing nobody who types their examples in can copy, and it does not
// survive being done forty times.

export interface Article {
  slug: string;
  title: string;
  /** The question the article answers, as somebody would type it. */
  question: string;
  /** One sentence for the index card and the page description. */
  standfirst: string;
  /** Sort order and freshness signal; ISO date. */
  published: string;
  /** Why this one exists — shown on the index so the shelf explains itself. */
  kind: "computed" | "explainer";
}

export const ARTICLES: Article[] = [
  {
    slug: "when-a-lease-stops-beating-a-car-loan",
    title: "When a novated lease stops beating a car loan",
    question: "How bad does the interest rate have to be before a bank loan wins?",
    standfirst:
      "Every lease comparison asks whether a quote is good. This one asks how bad it would have to get — solved from the tax rules rather than estimated, and different for an electric car than a petrol one.",
    published: "2026-09-14",
    kind: "computed",
  },
  {
    slug: "where-the-tax-saving-comes-from",
    title: "Where the tax saving on a novated lease comes from",
    question: "How much tax do you actually save, and on what?",
    standfirst:
      "Not a headline marginal rate. The saving is the difference between two whole tax positions, which is the only way bracket crossings, the low income tax offset and the Medicare levy land where they really fall.",
    published: "2026-09-14",
    kind: "explainer",
  },
];

export function articleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** Newest first — the order the index shows them in. */
export function articlesByDate(): Article[] {
  return [...ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
}

export const ARTICLE_KIND_LABEL: Record<Article["kind"], string> = {
  computed: "Solved from the rules",
  explainer: "How it works",
};
