import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getActiveConfig } from "@/lib/refdata";
import { calculateLease } from "@/lib/au/novated";
import { marginalRelief } from "@/lib/au/tax";
import { exampleInputs, EXAMPLE_SENTENCE } from "@/lib/au/examples";
import { articleBySlug } from "@/lib/articles";
import { fmtCurrency } from "@/lib/au/format";

/**
 * The one an employee cannot find out any other way.
 *
 * Every other article here explains something a determined reader could work
 * out from the ATO's own pages. This one is about a term of an employment
 * scheme that is published nowhere, appears on a payslip as four words, and
 * silently halves the number every novated lease calculator on the internet —
 * including this one until today — tells a public health employee they will
 * save.
 *
 * Computed like the rest: the example is the calculator's own default with one
 * thing changed, so every figure below moves when the tax does, and a reader
 * who opens the calculator afterwards sees the numbers they have just read.
 */

const article = articleBySlug("when-your-employer-keeps-part-of-the-saving")!;

export const metadata: Metadata = {
  title: article.title,
  description: article.standfirst,
  alternates: { canonical: `/articles/${article.slug}` },
};

const SHARE_PCT = 50;

export default async function Page() {
  const config = await getActiveConfig();
  const base = exampleInputs(config);
  const plain = calculateLease(base, config);
  const shared = calculateLease({ ...base, employerSavingSharePct: SHARE_PCT }, config);

  const pkg = shared.package;
  const years = base.termYears;

  /*
   * The shortcut, worked out so the article can show what it costs rather than
   * assert that it is wrong. Half the relief on the LEASE alone is the obvious
   * reading of "half the saving", and it is short by the tax the share itself
   * relieves.
   */
  const naiveShare =
    (SHARE_PCT / 100) * marginalRelief(base.salary, pkg.preTaxAnnual, config).taxSaved;

  const rows = [
    {
      label: "Tax the packaging avoids",
      plain: plain.package.taxSaved,
      shared: pkg.taxSaved,
      note: "higher, because the share is deducted pre-tax too",
    },
    {
      label: "What reaches you",
      plain: plain.package.taxSaved,
      shared: pkg.taxSaved - pkg.employerShare,
      note: "the figure a quote calls your saving",
    },
    {
      label: "What your employer keeps",
      plain: 0,
      shared: pkg.employerShare,
      note: "a second pre-tax deduction",
    },
    {
      label: "What the arrangement costs you, a year",
      plain: 0,
      shared: pkg.employerShareNetCost,
      note: "less than they get \u2014 see below",
    },
    {
      label: "The car's real cost, a year",
      plain: plain.package.netAnnualCost,
      shared: pkg.netAnnualCost,
      note: "after every deduction and all the relief",
    },
    {
      label: `What it beats a car loan by, over ${years} years`,
      plain: plain.comparison.savingVsLoan,
      shared: shared.comparison.savingVsLoan,
      note: "the number the decision actually turns on",
    },
  ];

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
            Salary packaging a car reduces your taxable income, and the tax you no longer pay is
            the whole point of doing it. Who ends up with that money is a separate question, and
            for a large number of Australians the answer is not &ldquo;you&rdquo;.
          </p>
          <p>
            Public health services, ambulance services, and a good many universities and councils
            run packaging as an employer scheme and keep a share of the benefit it creates —
            commonly half. It is a term of your employment rather than anything the financier sets
            or profits from, and it is entirely lawful. It is also close to invisible: it appears
            on a payslip as a second pre-tax line, often four words long, and on a quote usually
            not at all.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">What it does</h2>
          <p>
            On {EXAMPLE_SENTENCE}, with an employer keeping {SHARE_PCT}%:
          </p>
        </section>

        <section className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-4 font-semibold text-muted">&nbsp;</th>
                  <th className="py-2 pr-4 text-right font-semibold text-muted">No share</th>
                  <th className="py-2 pr-4 text-right font-semibold text-muted">
                    {SHARE_PCT}% share
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-4 text-ink">
                      {r.label}
                      <span className="block text-xs text-muted">{r.note}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-subtle">
                      {fmtCurrency(r.plain)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-ink">
                      {fmtCurrency(r.shared)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <p>
            Read the first row again: the tax avoided goes <em>up</em>, from{" "}
            {fmtCurrency(plain.package.taxSaved)} to {fmtCurrency(pkg.taxSaved)}. The share is
            itself deducted before tax, so it relieves tax of its own — the arrangement genuinely
            creates a little more relief than the lease alone would. The employer takes half of
            that larger figure, and you keep the other half.
          </p>
          <p>
            So what you end up with is{" "}
            <strong className="text-ink">{fmtCurrency(pkg.taxSaved - pkg.employerShare)}</strong>{" "}
            where you would have had {fmtCurrency(plain.package.taxSaved)} — not quite half as
            much, because the pot grew, but the shape of it is a halving. The employer&rsquo;s{" "}
            <strong className="text-ink">{fmtCurrency(pkg.employerShare)}</strong> a year is{" "}
            <strong className="text-ink">{fmtCurrency(shared.term.employerShare)}</strong> over{" "}
            {years} years.
          </p>
          <p>
            Nothing on a provider&rsquo;s quote is wrong about this. When a quote says you save{" "}
            {fmtCurrency(pkg.taxSaved - pkg.employerShare)} a year, that is accurate — it is your
            half. It simply does not say that it is a half, and there is no line on the page from
            which you could tell.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            What they get and what it costs you are different numbers
          </h2>
          <p>
            It would be easy to read the employer&rsquo;s{" "}
            {fmtCurrency(pkg.employerShare)} a year as your loss. It is not, and the gap is not
            small. Because the share is deducted <em>before</em> tax, part of it is funded by tax
            that is no longer collected rather than out of your pay.
          </p>
          <p>
            Your employer receives{" "}
            <strong className="text-ink">{fmtCurrency(pkg.employerShare)}</strong> a year. Your
            take-home falls by{" "}
            <strong className="text-ink">{fmtCurrency(pkg.employerShareNetCost)}</strong>. The
            remaining{" "}
            {fmtCurrency(pkg.employerShare - pkg.employerShareNetCost)} is paid by nobody — it is
            revenue the Commonwealth does not raise. Over {years} years the arrangement moves{" "}
            {fmtCurrency(shared.term.employerShare)} to your employer and costs you{" "}
            <strong className="text-ink">{fmtCurrency(shared.term.employerShareNetCost)}</strong>.
          </p>
          <p>
            That is worth being precise about in both directions. It is a smaller loss than the
            headline suggests — and it is still a loss, taken from a benefit that was described
            to you as yours.
          </p>

          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Why the share is bigger than half of what the lease saves
          </h2>
          <p>
            This is the part that catches people out, including anyone trying to check the figure
            themselves. The share is taken <em>before tax</em>, as a deduction sitting beside the
            lease — so it reduces your taxable income too, and enlarges the saving it is a share
            of.
          </p>
          <p>
            Half the relief on the lease by itself would be{" "}
            <strong className="text-ink">{fmtCurrency(naiveShare)}</strong> a year. The real figure
            is <strong className="text-ink">{fmtCurrency(pkg.employerShare)}</strong>, because the
            arrangement is half the relief on the lease <em>and the share together</em>. It is a
            number that refers to itself, and the only way to land it is to solve for it rather
            than multiply.
          </p>
          <p>
            That is also why checking it with a marginal rate and a calculator app will not
            reproduce your payslip, and why it is worth confirming the percentage rather than
            assuming it from the dollars.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">How to tell</h2>
          <p>
            <strong className="text-ink">On a payslip,</strong> look for a second pre-tax
            deduction next to the lease one. It is usually named for the employer rather than the
            car — &ldquo;share of saving&rdquo;, &ldquo;savings share&rdquo;, or the scheme&rsquo;s
            own name — and it is the one people assume is part of the lease.
          </p>
          <p>
            <strong className="text-ink">On a quote,</strong> add up the itemised inclusions and
            compare them with the total coming out of your pay. If the deduction is larger and
            nothing on the page accounts for the difference, work out what the packaging saves you
            in tax and see whether the gap is about half of it. Our{" "}
            <Link href="/decode" className="font-semibold text-accent hover:underline">
              quote decoder
            </Link>{" "}
            does that check automatically and will say so when the shape fits.
          </p>
          <p>
            <strong className="text-ink">Before you sign,</strong> ask your payroll or packaging
            contact directly: does the employer retain a share of the tax saving, and what
            percentage? It is not a difficult question and the answer is fixed by policy, not
            negotiated per person.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-base leading-relaxed text-subtle">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Whether it changes the decision
          </h2>
          <p>
            Sometimes. On this example the lease still beats a car loan, by{" "}
            {fmtCurrency(shared.comparison.savingVsLoan)} instead of{" "}
            {fmtCurrency(plain.comparison.savingVsLoan)} — worth less, still worth having. A
            packaged car is not suddenly a bad idea because somebody else has half the tax
            benefit.
          </p>
          <p>
            But the margin is what absorbs everything else: an interest rate above the market, a
            padded running-cost budget, a residual you had not planned for. Halve the margin and
            those stop being irritations and start being the difference between the two options.
            It is precisely the cases that were already close where this decides them — and those
            are the cases where being told a number twice the real one does the most damage.
          </p>
        </section>

        <div className="mt-10 rounded-xl border border-accent-border bg-accent-subtle p-5">
          <h2 className="text-base font-semibold text-ink">On your salary, and your scheme</h2>
          <p className="mt-2 text-sm text-subtle">
            The calculator takes the percentage your employer keeps and works the rest out from
            there — the whole saving, your half, and what the car really costs once it is out.
            Leave it at zero if your payslip shows no such line.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Work out yours
            </Link>
            <Link
              href="/articles/where-the-tax-saving-comes-from"
              className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              Where the saving comes from
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-muted">
          Computed when the page is requested, from the same reference data the calculator uses.
          The share an employer keeps is a term of an employment scheme rather than a tax rule —
          it is not published anywhere we could read it, so the {SHARE_PCT}% above is the common
          arrangement rather than yours. General information only, not financial or tax advice.
        </p>
      </main>
    </>
  );
}
