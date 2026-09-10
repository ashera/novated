import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getActiveVersion,
  getAuditLog,
  getVersion,
  listSources,
  listVersions,
} from "@/lib/refdata";
import { configToRows } from "@/lib/au/params";
import { computeStaleness } from "@/lib/au/staleness";
import AdminBackoffice from "@/components/AdminBackoffice";

export const metadata = { title: "Backoffice — Reference Data" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const versions = await listVersions();
  const { v } = await searchParams;
  const current = v ? await getVersion(v) : await getActiveVersion();

  if (!current) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center text-muted">
        No reference-data versions found. Run{" "}
        <code className="text-ink">scripts/seed-refdata.ts</code>.
      </main>
    );
  }

  const sources = await listSources();
  const sourceMap = new Map(sources.map((s) => [s.key, s]));
  const now = new Date();
  const staleSourceCount = sources.filter(
    (s) =>
      computeStaleness(s.last_updated_from, s.review_interval_days, now).state ===
      "stale",
  ).length;
  const rows = configToRows(current.data).map((r) => {
    const src = sourceMap.get(r.sourceKey);
    return {
      ...r,
      meta: current.meta[r.key] ?? null,
      sourceName: src?.name ?? r.sourceKey,
      sourceUrl: src?.url ?? null,
    };
  });
  const audit = await getAuditLog(current.id);

  return (
    <AdminBackoffice
      email={user.email}
      versions={versions.map((ver) => ({
        id: ver.id,
        financial_year: ver.financial_year,
        is_active: ver.is_active,
        status: ver.status,
      }))}
      current={{
        id: current.id,
        financial_year: current.financial_year,
        is_active: current.is_active,
        status: current.status,
        notes: current.notes,
        updated_at: current.updated_at,
      }}
      rows={rows}
      audit={audit}
      staleSourceCount={staleSourceCount}
    />
  );
}
