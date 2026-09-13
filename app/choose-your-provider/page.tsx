import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ByoChecker from "@/components/ByoChecker";
import { WHO_DECIDES, WHO_TO_ASK } from "@/lib/au/byoProvider";
import { SITE_NAME } from "@/lib/site";

/**
 * The first question, which the site has been telling people to ask and not
 * helping them answer.
 *
 * Step one of the quotes card says to check what your employer allows,
 * "because it is the difference between one quote and several" — and then
 * offers nothing. That is the gap this page closes. It matters more than it
 * looks: everything this site is good at assumes more than one quote to
 * compare, and whether somebody can get more than one is decided entirely by
 * their employer.
 *
 * Indexable, unlike the decoder, because "can I choose my own novated lease
 * provider" is a question people type into a search box before they have ever
 * heard of us — and it is a good first thing to be found for, since the honest
 * answer is one nobody selling a lease has any reason to give.
 */

export const metadata: Metadata = {
  title: "Can you choose your own novated lease provider?",
  description:
    "Whether you can use a novated lease provider your employer hasn't signed with — who actually decides, what's typical for government, health, corporate and small-business employers, and the exact message to send payroll to find out.",
  alternates: { canonical: "/choose-your-provider" },
};

// Only the questions this page answers in static copy — the tool's own output
// depends on what somebody enters and has no business being claimed here.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I choose my own novated lease provider?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `It depends on your employer, not on the leasing company. ${WHO_DECIDES} Many employers have one provider already set up, but having one is not the same as forbidding another, and the restriction is often assumed rather than written down.`,
      },
    },
    {
      "@type": "Question",
      name: "Who do I ask about using a different novated lease provider?",
      acceptedAnswer: { "@type": "Answer", text: WHO_TO_ASK },
    },
    {
      "@type": "Question",
      name: "What if my employer says I have to use their provider?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can still check that provider's numbers. A novated lease quote almost never prints the interest rate behind its monthly figure, and the running-cost budgets inside it are estimates that can be measured against the market. Being limited to one provider moves the work from comparing quotes to interrogating one — it does not remove it.",
      },
    },
  ],
};

export default function ChooseYourProviderPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />

        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Before you ask for a quote
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Can you choose your own novated lease provider?
          </h1>
          <p className="mt-3 text-subtle">
            It decides whether you get one quote or several — and a single quote tells you what a
            lease costs, not whether it is any good. The answer isn&apos;t the same for everyone,
            and it isn&apos;t the leasing company&apos;s to give.
          </p>

          <div className="mt-4 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3">
            <p className="text-sm text-ink">
              <strong className="font-semibold">Your employer decides.</strong> The payments come
              out of their payroll, they sign the novation deed, and the fringe benefits tax
              liability and reporting are theirs. No provider can approve this for you — and no
              employer has to offer novated leasing at all.
            </p>
          </div>
        </header>

        <section className="mt-8 rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-base font-semibold text-ink">Why this is worth two minutes</h2>
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            On the same car, term and salary, providers differ by thousands of dollars over a
            lease. That difference only ever becomes visible if you can put two quotes next to each
            other — so this one question decides how much the rest of this site can do for you. It
            is also the question most people never ask, because they were told a provider&apos;s
            name on their first day and reasonably took it as a rule.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            This page can&apos;t look your employer up. There is no register of packaging policies
            and there couldn&apos;t be one — it is a commercial arrangement, renegotiated on its
            own cycle, often not written down anywhere you can see. So instead it tells you
            what&apos;s typical and why, and writes the message that gets you a real answer.
          </p>
        </section>

        <ByoChecker />

        <div className="mt-10 rounded-xl border border-line bg-panel p-5">
          <h2 className="text-base font-semibold text-ink">Once you know</h2>
          <p className="mt-2 text-sm text-subtle">
            Whether you end up with one quote or four, they all go to the same place.{" "}
            {SITE_NAME} works out the interest rate a quote doesn&apos;t print, measures every
            running-cost budget against the market, and gives you the questions worth sending back.
            No commission, no provider relationships, no referral fees. General information only,
            not financial or tax advice.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Open the calculator
            </Link>
            <Link
              href="/glossary"
              className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              What the words mean
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
