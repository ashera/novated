import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listFeedback } from "@/lib/adminFeedback";
import AdminTabs from "@/components/AdminTabs";
import FeedbackTable from "@/components/FeedbackTable";

export const metadata = { title: "Backoffice — Feedback", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const items = await listFeedback();
  const newCount = items.filter((f) => !f.handled).length;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Your leases</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="feedback" feedbackCount={newCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Feedback</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">User feedback</h1>
        <p className="mt-2 text-muted">
          {items.length} {items.length === 1 ? "note" : "notes"}
          {newCount > 0 && ` · ${newCount} new`}.
        </p>
      </header>

      <FeedbackTable items={items} />
    </main>
  );
}
