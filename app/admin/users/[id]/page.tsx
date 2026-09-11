import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getUserDetail } from "@/lib/adminUsers";
import { fmtDate, fmtDateTime } from "@/lib/au/format";
import AdminTabs from "@/components/AdminTabs";
import UserActions from "@/components/UserActions";
import UserPlansList from "@/components/UserPlansList";

export const metadata = { title: "Backoffice — User", robots: { index: false } };
export const dynamic = "force-dynamic";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (!admin.is_admin) redirect("/");

  const { id } = await params;
  const u = await getUserDetail(id);
  if (!u) notFound();
  const isSelf = u.id === admin.id;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Your leases</Link>
        <span className="text-muted">{admin.email} · admin</span>
      </div>

      <AdminTabs active="users" />

      <div className="mb-4">
        <Link href="/admin/users" className="text-sm text-muted hover:text-ink">← All users</Link>
      </div>

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · User</div>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 break-all text-2xl font-bold text-ink">
          {u.email}
          {u.is_admin && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">Admin</span>
          )}
          {u.suspended && (
            <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger-text">Suspended</span>
          )}
        </h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Joined" value={fmtDate(u.created_at)} />
        <Info label="Last login" value={fmtDateTime(u.last_login_at)} />
        <Info label="Saved plans" value={String(u.plan_count)} />
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-panel p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Manage account</h2>
        <UserActions
          userId={u.id}
          email={u.email}
          isAdmin={u.is_admin}
          suspended={u.suspended}
          isSelf={isSelf}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Saved scenarios ({u.plans.length})
        </h2>
        <UserPlansList plans={u.plans} email={u.email} />
      </section>
    </main>
  );
}
