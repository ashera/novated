import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { migrateScenario } from "@/lib/au/types";

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
  const r = await query<{ name: string; data: unknown }>(
    "select name, data from plans where share_token = $1",
    [token],
  );
  const saved = r.rows[0];
  if (!saved) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const scenario = { ...migrateScenario(saved.data), name: saved.name };
  const config = await getActiveConfig();
  return NextResponse.json(
    { name: saved.name, scenario, config },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
