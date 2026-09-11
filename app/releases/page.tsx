import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import FooterNav from "@/components/FooterNav";
import ReleasesList from "@/components/ReleasesList";
import { listPublishedReleases } from "@/lib/releases";
import { SITE_URL } from "@/lib/site";

const title = "What’s new — LeaseWiz release notes";
const description =
  "Every update we ship to LeaseWiz, in plain language — new features, improvements and fixes, with dates and versions.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/releases` },
  openGraph: { title, description, url: `${SITE_URL}/releases`, type: "website" },
};
export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const releases = await listPublishedReleases();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" aria-label="LeaseWiz home">
          <Logo className="h-10 w-auto" />
        </Link>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Your leases
        </Link>
      </div>

      <header className="mb-8">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">What&apos;s new</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Release notes</h1>
        <p className="mt-2 text-muted">Every update we ship to LeaseWiz, in plain language.</p>
      </header>

      <ReleasesList releases={releases} />

      <div className="mt-10">
        <FooterNav />
      </div>
    </main>
  );
}
