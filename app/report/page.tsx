import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { getActivePlan } from "@/app/actions/plans";
import { DEFAULT_SCENARIO, migrateScenario } from "@/lib/au/types";
import LeaseReport from "@/components/LeaseReport";

export const metadata = { title: "Lease report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The signed-in user's active scenario, rendered for print. Guests are sent to
 *  sign in — the report has to come from a saved scenario, since the server
 *  can't see the browser-local one a guest is working on. */
export default async function ReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/report");

  const [active, config] = await Promise.all([getActivePlan(), getActiveConfig()]);
  const scenario = active ? migrateScenario(active.data) : DEFAULT_SCENARIO;

  return (
    <LeaseReport
      inputs={scenario.inputs}
      config={config}
      scenarioName={active?.name ?? scenario.name}
      preparedFor={user.name ?? user.email}
    />
  );
}
