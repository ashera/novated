import "server-only";
import { query } from "./db";

export interface Release {
  id: string;
  version: string;
  build: number | null;
  commit_hash: string | null;
  released_at: string; // YYYY-MM-DD
  title: string | null;
  notes: string[]; // plain-language bullet points (business terms)
  published: boolean;
}

const SELECT = `select id, version, build, commit_hash, released_at::text as released_at, title, notes, published from releases`;
const ORDER = `order by released_at desc, build desc nulls last, created_at desc`;

/** Published releases, newest first — for the public /releases changelog. */
export async function listPublishedReleases(): Promise<Release[]> {
  const r = await query<Release>(`${SELECT} where published ${ORDER}`);
  return r.rows;
}

/** Every release (incl. drafts) — for the backoffice editor. */
export async function listAllReleases(): Promise<Release[]> {
  const r = await query<Release>(`${SELECT} ${ORDER}`);
  return r.rows;
}
