import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { SITE_NAME } from "@/lib/site";
import { FAQS } from "@/lib/faqContent";

export const metadata: Metadata = {
  title: "Novated lease FAQ",
  description:
    "Plain-English answers to the common novated lease questions — how the tax saving works, what FBT and the employee contribution method do, the electric vehicle exemption, the residual, and what happens if you change jobs.",
  alternates: { canonical: "/faq" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />


      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Novated leasing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Novated lease FAQ
        </h1>
        <p className="mt-3 text-subtle">
          The questions people actually ask, answered without a sales pitch. General information
          only, not financial or tax advice. To see the numbers for your own situation, use the{" "}
          <Link href="/" className="font-medium text-accent hover:underline">free calculator</Link>.
        </p>
        <p className="mt-4 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3 text-sm text-ink">
          New to this?{" "}
          <Link href="/how-it-works" className="font-medium text-accent hover:underline">
            Start with how a novated lease works →
          </Link>{" "}
          — the whole mechanism in six steps. Already holding a quote?{" "}
          <Link href="/decode" className="font-medium text-accent hover:underline">
            Decode it →
          </Link>{" "}
          — we&apos;ll find the interest rate it doesn&apos;t print.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)] open:shadow-[var(--shadow-overlay)]"
          >
            <summary className="cursor-pointer list-none text-base font-semibold text-ink marker:hidden">
              <span className="flex items-start justify-between gap-4">
                {f.q}
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-subtle">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-line bg-panel p-5">
        <h2 className="text-base font-semibold text-ink">Still not sure?</h2>
        <p className="mt-2 text-sm text-subtle">
          {SITE_NAME} takes no commission and has no relationship with any lease provider. Put your
          own numbers in, or paste in a quote you&apos;ve been sent and we&apos;ll tell you what
          it actually costs.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/decode"
            className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            Decode a quote
          </Link>
          <Link
            href="/"
            className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
          >
            Model a lease
          </Link>
        </div>
      </div>
      </main>
    </>
  );
}
