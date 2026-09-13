import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getActiveConfig } from "@/lib/refdata";
import { glossary, allTerms, termSlug } from "@/lib/au/glossary";
import { SITE_NAME } from "@/lib/site";

/**
 * The page somebody lands on mid-quote.
 *
 * Every definition here already existed in the app's copy — in a tooltip, a
 * warning, a card's preamble — which is exactly the problem it solves: the
 * vocabulary was only ever explained at the moment it happened to come up.
 * Somebody holding a provider's quote and stuck on "ECM" has nowhere to look.
 *
 * Grouped by what a term belongs to rather than alphabetically. A–Z is only
 * useful to a reader who already knows the word they want, and this reader is
 * usually pointing at a line on a page and asking which of these things it is.
 * Three groups — the arrangement, the tax, the money — because that is also
 * the order in which a lease has to be understood.
 *
 * Every figure comes from the live config, so a budget change updates the
 * glossary along with the engine. Nothing is typed in twice.
 */

export const metadata: Metadata = {
  title: "Novated lease glossary",
  description:
    "Every term on a novated lease quote, in plain English — residual, novation, ECM, base value, RFBA, the statutory formula, grossing up, the car limit, amount financed and the luxury car adjustment. Includes the other names providers use for the same thing.",
  alternates: { canonical: "/glossary" },
};

export default async function GlossaryPage() {
  const config = await getActiveConfig();
  const sections = glossary(config);
  const terms = allTerms(config);

  // DefinedTermSet is the schema.org type built for exactly this, and it lets
  // a search engine answer "what is a residual" with our sentence rather than
  // a lease provider's.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "Novated lease glossary",
    description: metadata.description,
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.matters ? `${t.definition} ${t.matters}` : t.definition,
      ...(t.alsoCalled?.length ? { alternateName: t.alsoCalled } : {}),
    })),
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Novated leasing
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Novated lease glossary
          </h1>
          <p className="mt-3 text-subtle">
            {terms.length} terms, in the words a person would use. Quotes are not written to a
            standard vocabulary, so each entry also lists the other names providers print for the
            same thing. Every figure below is the one this site actually calculates with.
          </p>
          <p className="mt-4 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3 text-sm text-ink">
            Holding a quote right now?{" "}
            <Link href="/decode" className="font-medium text-accent hover:underline">
              Decode it line by line →
            </Link>{" "}
            — we&apos;ll name every figure on it and work out the interest rate it doesn&apos;t
            print.
          </p>
        </header>

        {/* A contents list, because the reader arrived looking for one word. */}
        <nav aria-label="Terms" className="mt-8 space-y-4">
          {sections.map((s) => (
            <div key={s.heading}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {s.heading}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1.5">
                {s.terms.map((t) => (
                  <li key={t.term}>
                    <a
                      href={`#${termSlug(t.term)}`}
                      className="inline-flex rounded border border-line bg-panel px-2 py-1 text-xs text-subtle transition hover:border-accent hover:text-accent"
                    >
                      {t.term}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold tracking-tight text-ink">{s.heading}</h2>
              <p className="mt-1 text-sm text-subtle">{s.blurb}</p>

              <dl className="mt-4 space-y-3">
                {s.terms.map((t) => (
                  <div
                    key={t.term}
                    id={termSlug(t.term)}
                    className="scroll-mt-20 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
                  >
                    <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-base font-semibold text-ink">{t.term}</span>
                      {t.alsoCalled?.length ? (
                        <span className="text-xs text-muted">
                          also called {t.alsoCalled.join(", ")}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-subtle">
                      {t.definition}
                      {t.matters ? (
                        <span className="mt-2 block text-ink">{t.matters}</span>
                      ) : null}
                      {t.seeHref && t.seeLabel ? (
                        <Link
                          href={t.seeHref}
                          className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline"
                        >
                          {t.seeLabel} →
                        </Link>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-line bg-panel p-5">
          <h2 className="text-base font-semibold text-ink">Now put a number on it</h2>
          <p className="mt-2 text-sm text-subtle">
            {SITE_NAME} takes no commission and has no relationship with any lease provider.
            Knowing what the words mean is the first half; the second is seeing what they do to
            your pay. General information only, not financial or tax advice.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Open the calculator
            </Link>
            <Link
              href="/faq"
              className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              Read the FAQ
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
