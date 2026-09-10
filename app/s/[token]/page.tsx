import { notFound } from "next/navigation";
import LeaseCalculator from "@/components/LeaseCalculator";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { migrateLease } from "@/lib/au/lease";

// A public, read-only share link. No login: the lease is looked up by its
// capability token and rendered as-is. Notes are deliberately not selected —
// they are the owner's private working notes, not part of what they shared.
export const metadata = {
  title: "Shared lease",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedLeasePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = await query<{ id: string; name: string; vehicle: unknown; scenario: unknown }>(
    "select id, name, vehicle, scenario from leases where share_token = $1",
    [token],
  );
  const row = r.rows[0];
  if (!row) notFound();

  const q = await query<{ data: unknown }>(
    "select data from lease_quotes where lease_id = $1 order by created_at",
    [row.id],
  );
  const config = await getActiveConfig();
  const lease = migrateLease({
    version: 1,
    name: row.name,
    vehicle: row.vehicle,
    scenario: row.scenario,
    quotes: q.rows.map((x) => x.data),
  });

  return <LeaseCalculator user={null} config={config} sharedLease={lease} />;
}
