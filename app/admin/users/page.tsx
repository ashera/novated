import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/adminUsers";
import { listVisitors, getVisitorStats, getDailyUniqueVisitors } from "@/lib/adminVisitors";
import { getLocationCounts, getLocationPoints } from "@/lib/adminGeoCounts";
import AdminTabs from "@/components/AdminTabs";
import UsersTable from "@/components/UsersTable";
import VisitorsTable from "@/components/VisitorsTable";
import VisitorsDailyChart from "@/components/VisitorsDailyChart";
import GeoMapView from "@/components/GeoMapView";

export const metadata = { title: "Backoffice — Users", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const raw = (await searchParams).view;
  const view: "accounts" | "visitors" | "map" =
    raw === "visitors" ? "visitors" : raw === "map" ? "map" : "accounts";

  const hrefFor = { accounts: "/admin/users", visitors: "/admin/users?view=visitors", map: "/admin/users?view=map" };
  const seg = (key: "accounts" | "visitors" | "map", label: string) => (
    <Link
      href={hrefFor[key]}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        view === key ? "bg-accent font-semibold text-white" : "font-medium text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-ink">← Calculator</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="users" />

      <div className="mb-6 inline-flex gap-1 rounded-lg border border-line bg-panel-2 p-1">
        {seg("accounts", "Accounts")}
        {seg("visitors", "Anonymous visitors")}
        {seg("map", "Map")}
      </div>

      {view === "accounts" ? <AccountsView /> : view === "visitors" ? <VisitorsView /> : <MapView />}
    </main>
  );
}

async function AccountsView() {
  const users = await listUsers();
  const admins = users.filter((u) => u.is_admin).length;
  const suspended = users.filter((u) => u.suspended).length;

  return (
    <>
      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Accounts</h1>
        <p className="mt-2 text-muted">
          {users.length} {users.length === 1 ? "account" : "accounts"} · {admins} admin
          {admins === 1 ? "" : "s"}
          {suspended > 0 && ` · ${suspended} suspended`}.
        </p>
      </header>
      <UsersTable users={users} />
    </>
  );
}

async function VisitorsView() {
  const [visitors, stats, daily] = await Promise.all([
    listVisitors(),
    getVisitorStats(),
    getDailyUniqueVisitors(30),
  ]);

  return (
    <>
      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Anonymous visitors</h1>
        <p className="mt-2 text-muted">
          People who used the site without signing up. {stats.total} human
          {stats.total === 1 ? "" : "s"} · {stats.last7Days} in the last 7 days ·{" "}
          {stats.engaged} engaged · {stats.converted} later signed up
          {stats.bots > 0 && ` · ${stats.bots} likely bot${stats.bots === 1 ? "" : "s"} (hidden by default)`}.
        </p>
      </header>
      <VisitorsDailyChart data={daily} />
      <VisitorsTable visitors={visitors} />
    </>
  );
}

async function MapView() {
  const [counts, points] = await Promise.all([getLocationCounts(), getLocationPoints()]);
  const countries = counts.length;
  const users = counts.reduce((s, c) => s + c.users, 0);
  const visitors = counts.reduce((s, c) => s + c.visitors, 0);

  return (
    <>
      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-ink">Where they are</h1>
        <p className="mt-2 text-muted">
          {users} account{users === 1 ? "" : "s"} and {visitors} visitor{visitors === 1 ? "" : "s"} across{" "}
          {countries} countr{countries === 1 ? "y" : "ies"} with a resolved location.
        </p>
      </header>
      <GeoMapView counts={counts} points={points} />
    </>
  );
}
