import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { StatExplainerBody } from "@/components/StatExplainer";
import { getActiveConfig } from "@/lib/refdata";
import { calculateLease } from "@/lib/au/novated";
import { exampleInputs, examplePetrolInputs, EXAMPLE_SENTENCE } from "@/lib/au/examples";
import { articleBySlug } from "@/lib/articles";
import { fmtCurrency } from "@/lib/au/format";

/**
 * The harvested article, and the reason the library is built this way.
 *
 * Not one word of the explanation below is written here. It renders
 * StatExplainerBody — the same component behind the help icon on the
 * calculator — against a worked example instead of the reader's own figures.
 *
 * Pasting the prose into this file would have been faster and would have left
 * two copies of every explanation to keep in step. This codebase has corrected
 * that mistake three times in a week: a loan-rate formula in three files, a
 * value formatter in two, a predicate duplicating another. An article library
 * built by copy-paste is that mistake at the scale of the whole site.
 */

const article = articleBySlug("where-the-tax-saving-comes-from")!;

export const metadata: Metadata = {
  title: article.title,
  description: article.standfirst,
  alternates: { canonical: `/articles/${article.slug}` },
};

export default async function Page() {
  const config = await getActiveConfig();
  const ev = calculateLease(exampleInputs(config), config);
  const petrol = calculateLease(examplePetrolInputs(config), config);

  /*
   * The rate a headline would quote: the bracket a salary sits in, plus the
   * Medicare levy. Derived rather than stated, so the contrast this article
   * draws cannot drift away from the brackets it is drawn against.
   *
   * On the default example the headline is exactly right. This was going to be
   * a paragraph claiming otherwise until the figures were checked: $110,000
   * less the deduction stays inside one bracket, so nothing moves. The
   * interesting cases are the ones either side of it.
   */
  const headlinePct = (salary: number) => {
    const b =
      config.tax.brackets.find((x) => salary <= x.upTo) ??
      config.tax.brackets[config.tax.brackets.length - 1];
    return (b.rate + config.tax.medicare.rate) * 100;
  };

  // One variable changed at a time from the example, so each gap is
  // attributable to the thing its row names.
  const variants = [
    { label: "This example", inputs: exampleInputs(config) },
    {
      label: "A salary that crosses a bracket",
      inputs: { ...exampleInputs(config), salary: 140_000 },
    },
    {
      label: "This example, with a study loan",
      inputs: { ...exampleInputs(config), hasHelpDebt: true },
    },
  ].map((v) => {
    const r = calculateLease(v.inputs, config);
    const actual = r.package.effectiveReliefRate * 100;
    const headline = headlinePct(r.inputs.salary);
    return { ...v, actual, headline, gap: actual - headline };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.standfirst,
    datePublished: article.published,
    mainEntityOfPage: `/articles/${article.slug}`,
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
          <Link href="/articles" className="text-xs font-semibold text-accent hover:underline">
            ← Articles
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-subtle">{article.standfirst}</p>
        </header>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <p>
            The saving on a novated lease is nearly always quoted as a marginal rate: package{" "}
            {fmtCurrency(ev.package.preTaxAnnual)} a year and save your top rate on all of it.
            Sometimes that is exactly right. Often it is several percentage points out — and it is
            furthest out for the people with the most to lose by believing it.
          </p>
          <p>
            Worked properly, on {EXAMPLE_SENTENCE}, it comes out like this. The explanation below
            is the same one the calculator shows against your own figures — it is running here on
            the example rather than being retold.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="space-y-4 text-sm leading-relaxed text-ink">
            <StatExplainerBody kind="taxSaved" result={ev} config={config} />
          </div>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            When the headline is right, and when it is not
          </h2>
          <p>
            On this example the relief works out at{" "}
            <strong className="text-ink">
              {(ev.package.effectiveReliefRate * 100).toFixed(1)}%
            </strong>{" "}
            of what is packaged, which is exactly what a headline would have told you. Nothing
            crosses a bracket here and there is no study loan in play, so the simple answer
            happens to be the right one.
          </p>
          <p>
            That is the trouble with it. It is right often enough to be trusted, and wrong in
            precisely the situations where the number matters most. Change one thing at a time and
            the gap opens up.
          </p>
        </section>

        <section className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-4 font-semibold text-muted">Situation</th>
                  <th className="py-2 pr-4 text-right font-semibold text-muted">Headline says</th>
                  <th className="py-2 pr-4 text-right font-semibold text-muted">Really</th>
                  <th className="py-2 text-right font-semibold text-muted">Out by</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.label} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">{v.label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-subtle">
                      {v.headline.toFixed(0)}%
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ink">
                      {v.actual.toFixed(1)}%
                    </td>
                    <td
                      className={
                        Math.abs(v.gap) < 0.05
                          ? "py-2 text-right tabular-nums text-muted"
                          : "py-2 text-right tabular-nums text-danger-text"
                      }
                    >
                      {Math.abs(v.gap) < 0.05
                        ? "spot on"
                        : `${Math.abs(v.gap).toFixed(1)} pts too high`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <p>
            The bracket case is the familiar one. Packaging removes a slice of income, and where
            that slice straddles a threshold the first dollars saved are worth more than the last,
            so the average across them lands below the top rate.
          </p>
          <p>
            The study loan is the one nobody warns you about, and it runs the opposite way to
            intuition. Packaging lowers your taxable income, which ought to lower the repayment —
            but the car generates a{" "}
            <Link
              href="/glossary#reportable-fringe-benefits-amount"
              className="font-medium text-accent hover:underline"
            >
              reportable fringe benefit
            </Link>
            , and that is added back when repayment income is worked out.{" "}
            <strong className="text-ink">An exempt electric car still generates one.</strong> The
            repayment goes up, and it takes a piece of the saving before you ever see it.
          </p>
          <p>
            None of that can be reasoned about from a rate. The only way to land it correctly is
            to compute the whole tax position twice — with the lease and without — and subtract,
            which is what produced every figure on this page.
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            And the saving is not the whole story
          </h2>
          <p>
            The same car in petrol pays fringe benefits tax, cancelled with{" "}
            {fmtCurrency(petrol.package.postTaxAnnual)} a year of salary that has already been
            taxed. Those dollars attract no relief at all, which is why the electric version of
            this example costs{" "}
            <strong className="text-ink">
              {fmtCurrency(petrol.package.netAnnualCost - ev.package.netAnnualCost)} a year less
            </strong>{" "}
            despite being the same price. The exemption, not the packaging, is doing most of that
            work.
          </p>
        </section>

        <div className="mt-10 rounded-xl border border-accent-border bg-accent-subtle p-5">
          <h2 className="text-base font-semibold text-ink">On your salary, not this one</h2>
          <p className="mt-2 text-sm text-subtle">
            The relief rate moves with your income, your car and whether you have a study loan.
            The calculator works it out the same way — twice, and subtract.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Work out yours
            </Link>
            <Link
              href="/articles/when-a-lease-stops-beating-a-car-loan"
              className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              When a lease stops being worth it
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-muted">
          Computed when the page is requested, from the same reference data the calculator uses.
          General information only, not financial or tax advice.
        </p>
      </main>
    </>
  );
}
