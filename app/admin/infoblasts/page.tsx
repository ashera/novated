import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import InfoBlastsAdmin from "@/components/InfoBlastsAdmin";
import { listAllInfoBlasts } from "@/lib/infoBlasts";

export const metadata = { title: "Backoffice — InfoBlasts", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InfoBlastsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const blasts = await listAllInfoBlasts();

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Calculator</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="infoblasts" />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Marketing · InfoBlasts</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Hero banner announcements</h1>
        <p className="mt-2 text-muted">
          Announcements shown in the banner at the foot of the dashboard hero card&apos;s right column. Each can carry an
          optional link button. Enabled InfoBlasts rotate every 30 seconds; disable one to hide it without deleting it.
        </p>
      </header>

      <InfoBlastsAdmin blasts={blasts} />
    </main>
  );
}
