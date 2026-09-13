import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getActiveConfig } from "@/lib/refdata";
import { listSources } from "@/lib/refdata";
import { breadcrumbLd } from "@/lib/seo";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

// Reads the live sources table, which admins edit (and which must never be
// frozen into a build artefact). Also keeps the build independent of the
// database — a deploy should not need Postgres to render a content page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About & methodology",
  description:
    "How this novated lease calculator works, what it assumes, where every rate comes from, and why it has no relationship with any lease provider.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const [config, sources] = await Promise.all([getActiveConfig(), listSources()]);

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
              { name: "About", path: "/about" },
            ]),
          ),
        }}
      />


      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          About {SITE_NAME}
        </h1>
        <p className="mt-3 text-subtle">{SITE_DESCRIPTION}</p>
      </header>

      {/* The origin and the funding, in that order and in the first person.
          Four negative claims about what we don't earn leave a reader
          wondering what the catch is; the answer is that there isn't a
          business here, and the only convincing way to say so is plainly. */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Why it exists</h2>
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          I built this for myself. I was weighing up a novated lease, found the decision much
          harder than it looked, and could not get a straight answer to what it would actually
          cost me — so I worked it out properly and put the working on a page. Friends who were
          in the same position asked to use it, which seemed like a good reason to make it
          available to everyone.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-subtle">
          Almost every novated lease calculator online is run by a company that earns a commission
          on the lease. Their numbers are not necessarily wrong, but they are built to make the
          answer look good, and the two figures that decide whether a lease is actually worth it —
          the interest rate and the residual — are usually the two that are hardest to find.
          This tool has no provider relationships and sells nothing. It shows the mechanism, then
          shows your numbers.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">How it&apos;s paid for</h2>
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          It isn&apos;t a business. There are no ads, no commissions, no referral fees and nothing
          to buy, and your figures are not sold or passed to a provider. It costs a domain and a
          small server, which I pay for, and that is the entire budget. If that ever changes it
          will be said here first — an independence claim is worth nothing if it is quietly
          allowed to go stale.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">How the numbers are worked out</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-subtle">
          <li>
            <strong className="text-ink">Tax relief is measured, not assumed.</strong> Rather than
            multiplying by a headline marginal rate, the model calculates your whole tax position
            with and without the packaged amount and takes the difference — so bracket crossings,
            the low income tax offset taper, the Medicare levy shade-in and HELP repayment steps
            are all handled correctly.
          </li>
          <li>
            <strong className="text-ink">FBT is modelled explicitly.</strong> The statutory formula,
            the gross-ups, the employee contribution method and the electric vehicle exemption each
            appear as their own step, so you can see which one is doing the work.
          </li>
          <li>
            <strong className="text-ink">Comparisons are like for like.</strong> The lease, the car
            loan and the cash purchase all fund the same car for the same term and all leave the
            same residual owing, so only the funding differs.
          </li>
          <li>
            <strong className="text-ink">Everything is in today&apos;s dollars.</strong> Nothing is
            indexed across the term, so a saving shown is a saving in money you recognise now.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">
          Where the rates come from — FY{config.financialYear}
        </h2>
        <p className="mt-2 text-sm text-subtle">
          Every rate is stored as dated reference data with a citation, reviewed on a schedule, and
          editable without a code change. These are the sources behind the current figures.
        </p>
        <ul className="mt-4 space-y-2">
          {sources.map((s) => (
            <li key={s.key} className="rounded-lg border border-line bg-panel p-3.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </span>
                <span className="text-xs text-muted">{s.organisation}</span>
              </div>
              {s.description && <p className="mt-1 text-xs text-muted">{s.description}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-warning/40 bg-warning-subtle p-5 text-sm text-warning-text">
        <h2 className="text-base font-semibold">General information only</h2>
        <p className="mt-2">
          {SITE_NAME} explains how novated leasing works under Australian tax law and models the
          figures you enter. It does not take your objectives, financial situation or needs into
          account, and it does not recommend any lease, financier or vehicle. Results are estimates
          and a real quote will differ. Consider advice from a registered tax agent or an Australian
          Financial Services licensee before committing to a lease.
        </p>
      </section>

      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
        >
          Model your lease
        </Link>
      </div>
      </main>
    </>
  );
}
