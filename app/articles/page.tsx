import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { articlesByDate, ARTICLE_KIND_LABEL } from "@/lib/articles";
import { SITE_NAME } from "@/lib/site";

/**
 * The shelf.
 *
 * Small on purpose. The competitor publishes around forty of these; the case
 * for doing fewer is that every page here is computed — the figures come from
 * the same engine the calculator runs on, against one shared worked example,
 * and they move when the tax does. Nobody who types their examples in can copy
 * that, and it does not survive being done forty times.
 */

export const metadata: Metadata = {
  title: "Novated lease articles",
  description:
    "Worked answers to the questions a novated lease raises — when a lease stops beating a car loan, and where the tax saving actually comes from. Every figure is computed from current rates rather than typed in.",
  alternates: { canonical: "/articles" },
};

export default function ArticlesPage() {
  const articles = articlesByDate();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {SITE_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Articles
          </h1>
          <p className="mt-3 text-subtle">
            A few questions worth a whole page. Every figure below is worked out by the same engine
            the calculator runs on, from the rates in force today — so when a budget moves them,
            these move with it. None of it is typed in.
          </p>
        </header>

        <div className="mt-8 space-y-4">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/articles/${a.slug}`}
              className="block rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)] transition hover:border-accent"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {ARTICLE_KIND_LABEL[a.kind]}
              </span>
              <h2 className="mt-1 text-lg font-semibold text-ink">{a.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-subtle">{a.standfirst}</p>
              <span className="mt-3 inline-flex text-xs font-semibold text-accent">
                Read it →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-base font-semibold text-ink">Looking for something shorter?</h2>
          <p className="mt-2 text-sm text-subtle">
            The{" "}
            <Link href="/glossary" className="font-medium text-accent hover:underline">
              glossary
            </Link>{" "}
            defines every term a quote uses, the{" "}
            <Link href="/faq" className="font-medium text-accent hover:underline">
              FAQ
            </Link>{" "}
            answers the common questions, and{" "}
            <Link href="/how-it-works" className="font-medium text-accent hover:underline">
              how it works
            </Link>{" "}
            walks the whole mechanism in six steps.
          </p>
        </div>
      </main>
    </>
  );
}
