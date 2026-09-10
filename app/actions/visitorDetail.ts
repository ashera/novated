"use server";

import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";

export interface VisitorEvent {
  event: string;
  path: string | null;
  props: Record<string, unknown> | null;
  created_at: string;
}

/** Admin: the full action log for one visitor, oldest-first, for the detail modal. */
export async function getVisitorEvents(
  visitorId: string,
): Promise<{ ok: boolean; events?: VisitorEvent[]; error?: string }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Not authorised." };
  try {
    const r = await query<VisitorEvent>(
      `select event, path, props, created_at
         from visitor_events
        where visitor_id = $1
        order by created_at asc
        limit 1000`,
      [visitorId],
    );
    return { ok: true, events: r.rows };
  } catch {
    return { ok: false, error: "Couldn't load the activity log." };
  }
}
