import { notFound } from "next/navigation";
import LeaseCalculator from "@/components/LeaseCalculator";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { migrateScenario } from "@/lib/au/types";

// A public, read-only share link. No login: the scenario is looked up by its
// capability token and rendered into a logged-out calculator preloaded with it.
export const metadata = {
  title: "Shared lease scenario",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedScenarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = await query<{ name: string; data: unknown }>(
    "select name, data from plans where share_token = $1",
    [token],
  );
  const saved = r.rows[0];
  if (!saved) notFound();

  const config = await getActiveConfig();
  const scenario = { ...migrateScenario(saved.data), name: saved.name };

  return <LeaseCalculator user={null} config={config} initialScenario={scenario} />;
}
