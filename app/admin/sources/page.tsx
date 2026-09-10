import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveVersion, listSources } from "@/lib/refdata";
import { configToRows } from "@/lib/au/params";
import { computeStaleness } from "@/lib/au/staleness";
import SourcesManager from "@/components/SourcesManager";

export const metadata = { title: "Backoffice — Sources" };

export default async function SourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [sources, active] = await Promise.all([
    listSources(),
    getActiveVersion(),
  ]);
  const rows = active ? configToRows(active.data) : [];
  const now = new Date();

  const enriched = sources.map((s) => {
    const params = rows
      .filter((r) => r.sourceKey === s.key)
      .map((r) => {
        const m = active?.meta[r.key] ?? null;
        return {
          key: r.key,
          label: r.label,
          category: r.category,
          unit: r.unit,
          value: r.value,
          lastVerifiedAt: m?.lastVerifiedAt ?? null,
          needsVerification: m?.needsVerification ?? false,
        };
      });
    return {
      ...s,
      params,
      verified: params.filter((p) => p.lastVerifiedAt && !p.needsVerification)
        .length,
      needsCheck: params.filter((p) => p.needsVerification).length,
      staleness: computeStaleness(s.last_updated_from, s.review_interval_days, now),
    };
  });

  const staleCount = enriched.filter((s) => s.staleness.state === "stale").length;
  const dueCount = enriched.filter((s) => s.staleness.state === "due").length;

  return (
    <SourcesManager
      email={user.email}
      activeFY={active?.financial_year ?? "—"}
      sources={enriched}
      staleCount={staleCount}
      dueCount={dueCount}
    />
  );
}
