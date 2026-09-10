import "server-only";
import { query } from "./db";

export interface InfoBlast {
  id: string;
  icon: string; // an attention-grabbing emoji (e.g. "✨", "🎉")
  title: string;
  subtext: string; // a paragraph of supporting copy
  link_url: string; // optional call-to-action URL ("" = no button)
  link_label: string; // optional button text (defaults to "Learn more" when a URL is set)
  enabled: boolean;
  sort_order: number;
}

const SELECT = `select id, icon, title, subtext, link_url, link_label, enabled, sort_order from info_blasts`;
const ORDER = `order by sort_order asc, created_at asc`;

/** Enabled blasts, in display order — for the rotating hero banner. */
export async function listActiveInfoBlasts(): Promise<InfoBlast[]> {
  const r = await query<InfoBlast>(`${SELECT} where enabled ${ORDER}`);
  return r.rows;
}

/** Every blast (incl. disabled) — for the backoffice editor. */
export async function listAllInfoBlasts(): Promise<InfoBlast[]> {
  const r = await query<InfoBlast>(`${SELECT} ${ORDER}`);
  return r.rows;
}
