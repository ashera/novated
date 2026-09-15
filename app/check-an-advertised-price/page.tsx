import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AdvertisedChecker from "@/components/AdvertisedChecker";
import { getActiveConfig } from "@/lib/refdata";
import { breadcrumbLd } from "@/lib/seo";

/**
 * The advertisement is how most people meet this product.
 *
 * Not a quote, not a calculator — a flyer in the letterbox or a tile on an
 * intranet, with a car, a weekly figure and a savings claim. Until now the site
 * had nothing that took one: the decoder needs four figures an ad doesn't
 * carry, and the calculator needs the price, which is the one number these ads
 * are arranged not to print.
 *
 * Indexable, and deliberately unlike the decoder in that respect. Somebody
 * holding a flyer types the car and the weekly figure into a search box before
 * they have heard of this site or decided to shop at all. That is the earliest
 * useful moment in the whole decision, and nobody selling a lease has any
 * reason to be the one who meets them there.
 *
 * On naming: no provider is named here or in the engine, and a test enforces
 * it. The format is universal — a weekly cost with the price withheld, a
 * "saving" with no stated baseline, a footnote describing somebody who isn't
 * the reader — and it is the format that deserves the criticism. Naming a
 * company would make this an attack ad instead of a tool, and would be wrong
 * the week they changed their artwork.
 */

/*
 * Rendered per request rather than frozen into the build.
 *
 * The config is handed to the client component and every figure on the page is
 * computed from it — including the EV phase dates, which are the one thing
 * here that changes on a legislated schedule. Prerendering would bake whatever
 * was in the database on the day of the last deploy into a page that then
 * tells people when their exemption ends. That is precisely the failure item
 * 18 was built to catch, and it is cheaper to not have it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check an advertised novated lease price",
  description:
    "Novated lease ads quote a weekly cost and leave out the price of the car. Enter the advertised figure and its fine print, and see the drive-away price it was written against, the residual it doesn't mention, and what it costs on your salary rather than the one in the footnote.",
  alternates: { canonical: "/check-an-advertised-price" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Why don't novated lease ads show the price of the car?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A weekly figure can't be compared with anything — not with another provider's offer, and not with the car on a dealer's website. The price can, which is why it is the number left out. Everything on the advertisement is derived from it, so it can be worked back out of the figures they do print.",
      },
    },
    {
      "@type": "Question",
      name: "Is the advertised weekly cost accurate?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Usually about right for the person described in the fine print. The issue is rarely the arithmetic — it is that the fine print describes one salary, one term and one annual distance, and the residual payable at the end of the lease appears nowhere on the page.",
      },
    },
    {
      "@type": "Question",
      name: "What does 'total savings' mean on a novated lease ad?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "There is no agreed definition, and the ads do not state a baseline. A saving is a comparison, so it is only as meaningful as what it is compared against — commonly paying for the same car and its running costs out of taxed income, sometimes without settling the residual in the comparison at all.",
      },
    },
  ],
};

export default async function CheckAdvertisedPricePage() {
  const config = await getActiveConfig();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              breadcrumbLd([
                { name: "Home", path: "/" },
                { name: "Check an advertised price", path: "/check-an-advertised-price" },
              ]),
              faqJsonLd,
            ]),
          }}
        />

        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            From a flyer, not a quote
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            What that weekly price isn&apos;t telling you
          </h1>
          <p className="mt-3 text-subtle">
            Novated lease advertisements all have the same shape: a car, a weekly figure, a total
            saving, and a footnote. What none of them print is the price of the car — and every
            other number on the page is worked out from it. Enter what the ad says and this works
            it back out, along with the residual the weekly figure leaves out and what the same
            deal costs on your salary instead of the one in the small print.
          </p>
        </header>

        <AdvertisedChecker config={config} />

        <section className="mt-12 max-w-3xl border-t border-line pt-8">
          <h2 className="text-lg font-semibold text-ink">Why the price is the missing number</h2>
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            A weekly cost can&apos;t be compared with anything. Two providers advertising the same
            car at $210 and $225 a week may be quoting different variants, different terms,
            different running-cost budgets or different interest rates, and nothing on either page
            lets you tell. A drive-away price can be compared — with the other provider, and with
            the manufacturer&apos;s own website. That is the whole reason it isn&apos;t there.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            None of which makes the advertised figure wrong. It is usually close to right for the
            person in the footnote. The problem is that the footnote describes one salary, one
            term and one annual distance, and that the residual — the lump still owing when the
            lease ends — has no place on an advertisement at all.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-ink">What to do with the answer</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-subtle">
            <li>
              <strong className="text-ink">Look the car up.</strong> If the implied price is close
              to what the car sells for, the ad is costed honestly and the questions are about what
              it omits. If it is well above, something is being financed that hasn&apos;t been
              named.
            </li>
            <li>
              <strong className="text-ink">Model it on your own numbers.</strong> The{" "}
              <Link href="/" className="text-accent hover:underline">
                calculator
              </Link>{" "}
              takes the implied price and your salary and shows the whole position, including the
              residual and what the same car costs on a plain car loan.
            </li>
            <li>
              <strong className="text-ink">Ask for a real quote, then check it.</strong> An
              advertisement is not an offer. When a quote arrives, the{" "}
              <Link href="/decode" className="text-accent hover:underline">
                decoder
              </Link>{" "}
              recovers the interest rate it doesn&apos;t state and benchmarks the fees.
            </li>
          </ul>
        </section>

        <section className="mt-10 max-w-3xl rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-sm font-semibold text-ink">About these figures</h2>
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            The implied price is solved by running the same model the calculator uses against the
            assumptions in the ad&apos;s own fine print, and adjusting the price until it produces
            the advertised weekly cost. It carries our running-cost estimates and our benchmark
            interest rate, not the advertiser&apos;s, so treat it as close rather than exact — a
            figure to sanity-check against a dealer&apos;s website, which is a thing you can do in
            a minute and the ad would rather you didn&apos;t.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-subtle">
            This site names no lease provider and has no relationship with any of them. Every
            advertisement of this kind has the same structure, and it is the structure being
            examined here.{" "}
            <Link href="/about" className="text-accent hover:underline">
              How this is funded and where the rates come from
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
