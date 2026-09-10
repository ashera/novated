import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { migrateLease } from "@/lib/au/lease";

// JSON twin of the /s/[token] shared-scenario page: given a scenario's read-only
// share token (an unguessable capability the owner opts into via "Share"), return
// the plan and the active engine config as JSON. Exposes nothing the shared page
// doesn't already; revoking the share link disables it. Handy for debugging a
// specific scenario outside the browser.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const r = await query<{ id: string; name: string; vehicle: unknown; scenario: unknown }>(
    "select id, name, vehicle, scenario from leases where share_token = $1",
    [token],
  );
  const saved = r.rows[0];
  if (!saved) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const q = await query<{ data: unknown }>(
    "select data from lease_quotes where lease_id = $1 order by created_at",
    [saved.id],
  );
  const lease = migrateLease({
    version: 1,
    name: saved.name,
    vehicle: saved.vehicle,
    scenario: saved.scenario,
    quotes: q.rows.map((x) => x.data),
  });
  const config = await getActiveConfig();
  return NextResponse.json(
    { name: saved.name, lease, config },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
