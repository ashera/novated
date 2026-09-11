import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import ReleasesAdmin from "@/components/ReleasesAdmin";
import { listAllReleases } from "@/lib/releases";
import { APP_VERSION, BUILD, GIT_SHA } from "@/lib/version";

export const metadata = { title: "Backoffice — Releases", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReleasesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const releases = await listAllReleases();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Your leases</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="releases" />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Releases</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Release notes</h1>
        <p className="mt-2 text-muted">
          Author the plain-language changelog shown on the public{" "}
          <Link href="/releases" className="text-accent hover:underline">/releases</Link> page. Version, build and commit
          are prefilled from the current deploy ({APP_VERSION} · build {BUILD} · {GIT_SHA}).
        </p>
      </header>

      <ReleasesAdmin releases={releases} defaults={{ version: APP_VERSION, build: BUILD, commit: GIT_SHA, date: today }} />
    </main>
  );
}
