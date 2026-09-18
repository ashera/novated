import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import StatementReader from "@/components/StatementReader";
import { getActiveConfig } from "@/lib/refdata";
import { breadcrumbLd } from "@/lib/seo";

/**
 * The five years after the signature.
 *
 * Everything else here is about the decision — should I, is that ad real, is
 * this quote any good. This is the first page about being in a lease already,
 * and it is the only one with a reason to be revisited: a quote is decoded
 * once, a statement arrives every month.
 *
 * Indexable. "Novated lease statement explained" is typed by somebody who has
 * already signed, which is a moment nobody serves — the comparison sites stop
 * at the decision and the provider's portal is the thing being questioned.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Understand your novated lease statement",
  description:
    "Paste the transactions from your novated lease provider's portal and see what the account is actually doing: whether the running balance adds up, what the GST credits really are, where the money goes each month, and whether the balance is building up or running down.",
  alternates: { canonical: "/understand-your-statement" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What are the GST credits on my novated lease statement?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not income. They are GST on money already spent out of the same account, coming back because your employer claims it. A lease rental is GST-inclusive, so the credit against one rental is exactly a tenth of it — if your rental is $1,602.81, the credit is $145.71. Several arriving on one day means several months of credits were passed back at once, and until then the account was short by that much.",
      },
    },
    {
      "@type": "Question",
      name: "Whose money is the balance on a novated lease account?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yours. It is what has been deducted from your pay and not yet spent on the car. A surplus is refunded when the lease ends, but it comes back through payroll and is taxed on the way, because it went in untaxed. A balance that keeps climbing usually means the running-cost budgets were set higher than the car actually needs.",
      },
    },
    {
      "@type": "Question",
      name: "Why did my novated lease deduction go up?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Usually because the account is running down: more is being paid out for fuel, servicing, tyres, insurance and registration than is going in, so the provider raises the deduction at a review to cover it. The statement shows this coming months in advance — the balance falls steadily rather than holding level.",
      },
    },
  ],
};

export default async function StatementPage() {
  const config = await getActiveConfig();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              breadcrumbLd([
                { name: "Home", path: "/" },
                { name: "Understand your statement", path: "/understand-your-statement" },
              ]),
              faqJsonLd,
            ]),
          }}
        />

        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Already in a lease
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            What your statement is actually telling you
          </h1>
          <p className="mt-3 text-subtle">
            Money leaves your pay into an account the provider holds, and your car&apos;s bills are
            paid out of it. The statement lists every movement and explains none of them. Paste the
            transactions in and this checks the arithmetic, groups the lines by what they are for,
            and says whether the balance is building up or running down — and what that means for
            your next deduction.
          </p>
        </header>

        <StatementReader config={config} />

        <section className="mt-12 max-w-3xl border-t border-line pt-8">
          <h2 className="text-lg font-semibold text-ink">The three things people ask</h2>

          <h3 className="mt-5 text-base font-semibold text-ink">
            &ldquo;What are the GST credits?&rdquo;
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-subtle">
            They arrive as money in, so they look like income. They are not: they are GST on
            something already paid out of the same account, coming back because your employer
            claims it. A lease rental is GST-inclusive, so the credit against one rental is exactly
            a tenth of it — a rental of $1,602.81 returns $145.71. That relationship is exact, which
            is how this page can identify them rather than guess, and how it can tell you when
            several months&apos; worth have arrived in one batch.
          </p>

          <h3 className="mt-5 text-base font-semibold text-ink">
            &ldquo;Whose money is the balance?&rdquo;
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-subtle">
            Yours. It is what has come out of your pay and not yet been spent on the car. A surplus
            is refunded at the end of the lease — but through payroll, and taxed on the way back,
            because it went in untaxed. So a balance that climbs month after month is not a saving:
            it is money you pre-paid, held by somebody else, that comes back smaller than it left.
            The usual cause is running-cost budgets set higher than the car needs, which is worth
            asking to have lowered.
          </p>

          <h3 className="mt-5 text-base font-semibold text-ink">
            &ldquo;Why did my deduction go up?&rdquo;
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-subtle">
            Almost always because the account was running down and a review caught it. That is
            visible months ahead in the balance, which falls steadily rather than holding level —
            and knowing it early turns a letter you receive into a conversation you start.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-ink">What this does not know</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-subtle">
            <li>
              <strong className="text-ink">It reads what you paste, and nothing else.</strong> If
              the list is partial, the totals are partial. It cannot see your provider&apos;s
              system, your payroll or your FBT position.
            </li>
            <li>
              <strong className="text-ink">A line it cannot categorise is still counted</strong> in
              the balance, and named on screen so you can see what it did not understand.
            </li>
            <li>
              <strong className="text-ink">It is general information, not tax advice.</strong> If
              something here disagrees with your provider, ask them — the questions are written to
              be sent.
            </li>
          </ul>

          <p className="mt-6 text-sm leading-relaxed text-subtle">
            Not in a lease yet? The{" "}
            <Link href="/" className="text-accent hover:underline">
              calculator
            </Link>{" "}
            models one before you sign, and{" "}
            <Link href="/check-an-advertised-price" className="text-accent hover:underline">
              an advertised weekly price
            </Link>{" "}
            can be taken apart before you ask for a quote.
          </p>
        </section>
      </main>
    </>
  );
}
