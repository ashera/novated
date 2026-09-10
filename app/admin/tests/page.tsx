import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLatestTestRun, listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import TestsView from "@/components/TestsView";

export const metadata = { title: "Backoffice — Feature Tests" };

export default async function TestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [run, sources] = await Promise.all([getLatestTestRun(), listSources()]);
  const now = new Date();
  const staleCount = sources.filter(
    (s) =>
      computeStaleness(s.last_updated_from, s.review_interval_days, now).state ===
      "stale",
  ).length;

  return <TestsView email={user.email} run={run} staleCount={staleCount} />;
}
