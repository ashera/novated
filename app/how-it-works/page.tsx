import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getActiveConfig } from "@/lib/refdata";
import { breadcrumbLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "How a novated lease works",
  description:
    "The mechanism, step by step: novation, salary sacrifice, fringe benefits tax, the employee contribution method, the electric vehicle exemption and the residual — in plain English.",
  alternates: { canonical: "/how-it-works" },
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${+(n * 100).toFixed(0)}%`;

export default async function HowItWorksPage() {
  const config = await getActiveConfig();

  const steps = [
    {
      n: 1,
      title: "You choose the car",
      body: "You pick the vehicle — new, used or, in some cases, the one already in your driveway. A financier buys it and leases it to you. Because the financier is a business, it claims the GST back on the purchase, which is the first of the two savings.",
    },
    {
      n: 2,
      title: "Your employer takes on the payments",
      body: "That is the novation: a deed under which your employer agrees to make the lease payments on your behalf while you work there. You still drive the car and you still bear the obligation if you leave — but for now the payments come out of payroll.",
    },
    {
      n: 3,
      title: "The payments come out of your salary before tax",
      body: "This is the whole point. A pre-tax deduction reduces the income you are taxed on, so a dollar of car cost only really costs you a dollar less your marginal rate. At the 30% bracket plus the Medicare levy, that is about 68 cents. Running costs packaged the same way get the same treatment — and are bought GST-free.",
    },
    {
      n: 4,
      title: "FBT has to be dealt with",
      body: `Giving an employee a car for private use is a fringe benefit. Under the statutory formula its taxable value is ${pct(config.fbt.statutoryRate)} of the car's GST-inclusive price every year, and FBT is charged at ${pct(config.fbt.rate)} on that once grossed up. Left alone it would swallow the saving whole — so it never is.`,
    },
    {
      n: 5,
      title: "Either the car is exempt, or you contribute post-tax",
      body: `A battery-electric vehicle priced at or under ${fmt(config.lct.thresholdFuelEfficient)} is exempt from FBT outright, so the entire package stays pre-tax. For every other car, the employee contribution method applies: you pay an amount equal to the FBT taxable value out of POST-tax salary, which reduces the FBT to nil. Those dollars get no tax relief — that is the trade.`,
    },
    {
      n: 6,
      title: "At the end of the term, the residual falls due",
      body: `Every lease ends with an amount still owing — ${config.lease.residualMinPct["5"]}% of the financed amount on a five-year term, rising to ${config.lease.residualMinPct["1"]}% on a one-year term. You pay it and keep the car, refinance it into a new lease, or sell the car and cover any shortfall. It is not optional and it is not small.`,
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: "How it works", path: "/how-it-works" },
            ]),
          ),
        }}
      />


      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          How a novated lease actually works
        </h1>
        <p className="mt-3 text-subtle">
          Novated leasing is explained badly almost everywhere, usually by someone selling one.
          Here is the mechanism in six steps, with nothing hidden behind a quote.
        </p>
      </header>

      <ol className="mt-8 space-y-5">
        {steps.map((s) => (
          <li
            key={s.n}
            className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {s.n}
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-subtle">{s.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-10 rounded-xl border border-accent-border bg-accent-subtle p-5">
        <h2 className="text-base font-semibold text-ink">The two questions worth asking a provider</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-subtle">
          <li>
            <strong className="text-ink">What is the interest rate?</strong> It is frequently absent
            from a quote. Without it you cannot tell how much of your &ldquo;saving&rdquo; is being
            handed back as finance margin.
          </li>
          <li>
            <strong className="text-ink">What exactly is the residual, and what happens if the
            car is worth less?</strong> The shortfall is yours, not the financier&apos;s.
          </li>
        </ol>
        <p className="mt-3 text-sm text-subtle">
          If you already have a quote, our decoder answers the first one for you — the rate is
          recoverable from the figures on the page, even when it isn&apos;t printed.{" "}
          <Link href="/" className="font-medium text-accent hover:underline">
            Start in the calculator
          </Link>{" "}
          and open it from there.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-line bg-panel p-5">
        <h2 className="text-base font-semibold text-ink">Where {SITE_NAME}&apos;s numbers come from</h2>
        <p className="mt-2 text-sm text-subtle">
          Every rate used on this site — tax brackets, the FBT rate and gross-ups, the statutory
          percentage, GST and luxury car tax thresholds, the ATO minimum residuals — is stored as
          dated reference data with a citation to its source, and reviewed on a schedule. The
          figures on this page are read from that data for FY{config.financialYear}, so a page
          cannot quietly go stale while the rules move on. See{" "}
          <Link href="/about" className="font-medium text-accent hover:underline">
            about and methodology
          </Link>
          .
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
        >
          Model your own lease
        </Link>
        <Link
          href="/faq"
          className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
        >
          Read the FAQ
        </Link>
      </div>
      </main>
    </>
  );
}
