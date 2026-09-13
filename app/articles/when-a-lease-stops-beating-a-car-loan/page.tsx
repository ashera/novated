import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getActiveConfig } from "@/lib/refdata";
import { solveCrossover } from "@/lib/au/crossover";
import { exampleInputs, examplePetrolInputs, EXAMPLE_SENTENCE } from "@/lib/au/examples";
import { articleBySlug } from "@/lib/articles";
import { fmtCurrency } from "@/lib/au/format";

/**
 * The first computed article.
 *
 * Its entire claim is a number nobody publishes, and it is solved here rather
 * than written down: bisect the finance rate until the lease stops beating a
 * car loan, using the same engine and the same tax rules the calculator runs
 * on. Change the statutory percentage or the thresholds and every figure on
 * this page moves on the next request.
 *
 * It exists because of a test. Pinning "a worse lease rate must never widen
 * the lease's lead" meant asking where the lead runs out, and the gap between
 * an exempt electric car and a packaged petrol one was too wide to keep in a
 * test file.
 */

const article = articleBySlug("when-a-lease-stops-beating-a-car-loan")!;

export const metadata: Metadata = {
  title: article.title,
  description: article.standfirst,
  alternates: { canonical: `/articles/${article.slug}` },
};

export default async function Page() {
  const config = await getActiveConfig();
  const ev = solveCrossover("Electric car", exampleInputs(config), config);
  const petrol = solveCrossover("Petrol car", examplePetrolInputs(config), config);
  const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

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
            A novated lease wins on tax and loses on interest. Every comparison on this site asks
            whether a particular quote comes out ahead — but the more useful question sits behind
            it: <strong className="text-ink">how bad would the finance rate have to be</strong>{" "}
            before you would be better off at a bank?
          </p>
          <p>
            Nobody publishes that number. Working it out means modelling the whole tax position
            rather than applying a headline rate, and the people who could do it sell leases. So
            here it is, solved from the rules in force today, on {EXAMPLE_SENTENCE} — the same
            defaults the calculator opens with.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {[ev, petrol].map((x) => (
            <div
              key={x.label}
              className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {x.label}
                {x.exempt ? " · FBT exempt" : " · pays FBT"}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
                {pct(x.ratePct)}
              </p>
              <p className="mt-1 text-sm text-subtle">
                Above this finance rate, a car loan costs you less.
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            The exemption buys room, not immunity
          </h2>
          <p>
            An eligible electric car pays no fringe benefits tax, so there is no post-tax
            contribution eating into the saving. That is worth a great deal — but it is worth a
            great deal <em>of tolerance for a bad rate</em>, not a free pass. The petrol car runs
            out of road{" "}
            {ev.ratePct != null && petrol.ratePct != null ? (
              <strong className="text-ink">
                {Math.round((ev.ratePct - petrol.ratePct) * 10) / 10} percentage points earlier
              </strong>
            ) : (
              "considerably earlier"
            )}
            , because every dollar of its FBT is cancelled with salary that has already been
            taxed.
          </p>
          <p>
            Read it the other way round and it is a warning. A provider quoting an electric car at
            a rate a bank would not touch can still show you a saving — the exemption is carrying
            it, not the deal.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight text-ink">What it looks like</h2>
          <p className="mt-2 text-sm text-subtle">
            The lease&apos;s advantage over a car loan across the term, by finance rate. Positive
            means the lease is ahead.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-4 font-semibold text-muted">Finance rate</th>
                  <th className="py-2 pr-4 text-right font-semibold text-muted">
                    Electric (exempt)
                  </th>
                  <th className="py-2 text-right font-semibold text-muted">Petrol</th>
                </tr>
              </thead>
              <tbody>
                {ev.points.map((p, i) => {
                  const q = petrol.points[i];
                  const cell = (v: number) => (
                    <span className={v >= 0 ? "text-success-text" : "text-danger-text"}>
                      {v >= 0 ? "+" : "−"}
                      {fmtCurrency(Math.abs(v))}
                    </span>
                  );
                  return (
                    <tr key={p.ratePct} className="border-b border-line/60">
                      <td className="py-2 pr-4 tabular-nums text-ink">{p.ratePct}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{cell(p.savingVsLoan)}</td>
                      <td className="py-2 text-right tabular-nums">{cell(q.savingVsLoan)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The loan is costed at {config.benchmarks.loanRatePct}% — a comparable secured car loan,
            the same benchmark a quote&apos;s finance rate is judged against on this site. All
            three ways of paying leave you owning the same car with the same residual settled, so
            only the funding differs.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            The rate that matters is not the one you think
          </h2>
          <p>
            Almost everyone packaging a car uses the{" "}
            <Link href="/glossary#employee-contribution-method" className="font-medium text-accent hover:underline">
              employee contribution method
            </Link>
            : you pay part of the package from salary that has already been taxed, in an amount
            that reduces the FBT bill to nil. Because it reaches nil,{" "}
            <strong className="text-ink">the {(config.fbt.rate * 100).toFixed(0)}% FBT rate never
            enters the arithmetic at all</strong>. What the car actually costs you is the{" "}
            <Link href="/glossary#statutory-formula-method" className="font-medium text-accent hover:underline">
              statutory percentage
            </Link>{" "}
            — {(config.fbt.statutoryRate * 100).toFixed(0)}% of its price, every year, in post-tax
            dollars.
          </p>
          <p>
            That is why a rise in the headline FBT rate would not move either number above, and a
            change to the statutory percentage would move both. It is also why an expensive car
            hurts more than an expensive rate: the contribution is charged on the price, not on
            the borrowing.
          </p>
        </section>

        <div className="mt-10 rounded-xl border border-accent-border bg-accent-subtle p-5">
          <h2 className="text-base font-semibold text-ink">Where does your quote sit?</h2>
          <p className="mt-2 text-sm text-subtle">
            A quote almost never prints its interest rate. Paste in the monthly figure, the amount
            financed, the term and the residual, and we&apos;ll recover it — then you can put it
            against the numbers above.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/decode"
              className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Find the rate in your quote
            </Link>
            <Link
              href="/"
              className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              Run your own numbers
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-muted">
          Every figure on this page is computed when the page is requested, from the same
          reference data the calculator uses, and changes with it. It is general information
          rather than financial or tax advice, and it describes one worked example — your salary,
          car and term will move all of it.
        </p>
      </main>
    </>
  );
}
