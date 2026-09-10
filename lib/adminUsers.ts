import "server-only";
import { query } from "./db";

export interface AdminUserRow {
  id: string;
  email: string;
  is_admin: boolean;
  suspended: boolean;
  created_at: string;
  last_login_at: string | null;
  country: string | null;
  plan_count: number;
}

export interface AdminUserDetail extends AdminUserRow {
  plans: { id: string; name: string; updated_at: string }[];
}

const ROW_SELECT = `
  select u.id, u.email, u.is_admin, u.suspended, u.created_at, u.last_login_at, u.country,
         (select count(*)::int from plans p where p.user_id = u.id) as plan_count
    from users u`;

export async function listUsers(): Promise<AdminUserRow[]> {
  const r = await query<AdminUserRow>(`${ROW_SELECT} order by u.created_at desc`);
  return r.rows;
}

export interface UserStats {
  total: number;
  last7Days: number; // signed up in the last 7 days
}

/** Headline user counts for the admin stats pill. */
export async function getUserStats(): Promise<UserStats> {
  const r = await query<{ total: number; last7days: number }>(
    `select count(*)::int as total,
            count(*) filter (where created_at >= now() - interval '7 days')::int as last7days
       from users`,
  );
  const row = r.rows[0];
  return { total: row?.total ?? 0, last7Days: row?.last7days ?? 0 };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail | null> {
  try {
    const u = await query<AdminUserRow>(`${ROW_SELECT} where u.id = $1`, [id]);
    const user = u.rows[0];
    if (!user) return null;
    const plans = await query<{ id: string; name: string; updated_at: string }>(
      "select id, name, updated_at from plans where user_id = $1 order by updated_at desc",
      [id],
    );
    return { ...user, plans: plans.rows };
  } catch {
    // Invalid uuid or missing → treat as not found.
    return null;
  }
}
