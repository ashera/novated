import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { getActiveLease } from "@/app/actions/leases";
import { leaseToInputs, newLease } from "@/lib/au/lease";
import LeaseReport from "@/components/LeaseReport";

export const metadata = { title: "Lease report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The signed-in user's active lease, laid out for print. Guests are sent to
 *  sign in — the report comes from a saved lease, and the server can't see the
 *  one a guest is holding in their browser. */
export default async function ReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/report");

  const [active, config] = await Promise.all([getActiveLease(), getActiveConfig()]);
  const lease = active?.lease ?? newLease();

  return (
    <LeaseReport
      inputs={leaseToInputs(lease)}
      config={config}
      scenarioName={lease.name}
      preparedFor={user.name ?? user.email}
    />
  );
}
