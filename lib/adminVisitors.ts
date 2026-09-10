import "server-only";
import { query } from "./db";

export interface AdminVisitorRow {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  visits: number;
  priced_vehicle: boolean;
  vehicle_price: number | null;
  set_salary: boolean;
  salary: number | null;
  visited_compare: boolean;
  visited_report: boolean;
  signed_up: boolean;
  converted_user_id: string | null;
  converted_email: string | null;
  is_bot: boolean | null;
  bot_reason: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  ip: string | null;
  locale: string | null;
  user_agent: string | null;
}

const VISITOR_SELECT = `
  select v.id, v.first_seen_at, v.last_seen_at, v.visits,
         v.priced_vehicle, v.vehicle_price, v.set_salary, v.salary,
         v.visited_compare, v.visited_report, v.signed_up,
         v.converted_user_id, u.email as converted_email,
         v.is_bot, v.bot_reason,
         v.country, v.region, v.city, v.ip, v.locale, v.user_agent
    from visitors v
    left join users u on u.id = v.converted_user_id`;

export async function listVisitors(limit = 500): Promise<AdminVisitorRow[]> {
  const r = await query<AdminVisitorRow>(
    `${VISITOR_SELECT} order by v.last_seen_at desc limit $1`,
    [limit],
  );
  return r.rows;
}

export interface VisitorStats {
  total: number; // humans (excludes bots)
  last7Days: number; // human, seen in the last 7 days
  engaged: number; // human, hit at least one milestone
  converted: number; // human, later signed up
  bots: number; // flagged as likely bots
}

/** Headline anonymous-visitor counts for the Users page's Visitors view. Humans and
 *  bots are counted separately so the funnel figures reflect real people. */
export async function getVisitorStats(): Promise<VisitorStats> {
  const r = await query<{
    total: number;
    last7days: number;
    engaged: number;
    converted: number;
    bots: number;
  }>(
    `select
        count(*) filter (where not coalesce(is_bot, false))::int as total,
        count(*) filter (where not coalesce(is_bot, false)
                              and last_seen_at >= now() - interval '7 days')::int as last7days,
        count(*) filter (where not coalesce(is_bot, false)
                              and (priced_vehicle or set_salary
                                   or visited_compare or visited_report))::int as engaged,
        count(*) filter (where not coalesce(is_bot, false) and signed_up)::int as converted,
        count(*) filter (where coalesce(is_bot, false))::int as bots
       from visitors`,
  );
  const row = r.rows[0];
  return {
    total: row?.total ?? 0,
    last7Days: row?.last7days ?? 0,
    engaged: row?.engaged ?? 0,
    converted: row?.converted ?? 0,
    bots: row?.bots ?? 0,
  };
}

export interface DailyVisitors {
  day: string; // YYYY-MM-DD
  looked: number; // active that day, hit NO milestone ("just looked around")
  engaged: number; // active that day, hit ≥1 milestone (car/salary/compare/report)
  bots: number; // active that day, flagged as a likely bot
  uniques: number; // looked + engaged (total distinct HUMAN visitors active)
}

/** Unique (human) visitors ACTIVE each day over the last `days` days — distinct
 *  visitor_ids in the pageview/event log, bucketed by day, empty days filled with 0.
 *  Each day's uniques are split into "engaged" (the visitor hit at least one funnel
 *  milestone) vs "looked around" (none), using the same engaged definition as
 *  getVisitorStats. Engagement is a per-visitor attribute, so a visitor who engages
 *  on any day counts as engaged on every day they were active. Likely bots are
 *  counted separately (`bots`) so they can be shown as their own segment; `uniques`
 *  stays human-only (looked + engaged). */
export async function getDailyUniqueVisitors(days = 30): Promise<DailyVisitors[]> {
  // Bucket by AUSTRALIAN local days (Sydney, AEST/AEDT) — `created_at` is timestamptz,
  // so we convert to Sydney time before truncating to a date, and anchor "today" to
  // the Sydney date. The event scan is filtered a little wide; the join to the day
  // series restricts it to the exact window.
  const r = await query<{ day: string; looked: number; engaged: number; bots: number }>(
    `with b as (select (now() at time zone 'Australia/Sydney')::date as today_au)
     select to_char(d, 'YYYY-MM-DD') as day,
            coalesce(c.looked, 0)::int as looked,
            coalesce(c.engaged, 0)::int as engaged,
            coalesce(c.bots, 0)::int as bots
       from b,
            generate_series(b.today_au - ($1::int - 1), b.today_au, interval '1 day') d
       left join (
         select (e.created_at at time zone 'Australia/Sydney')::date as day,
                count(distinct e.visitor_id) filter (
                  where not coalesce(v.is_bot, false)
                    and not (v.priced_vehicle or v.set_salary
                             or v.visited_compare or v.visited_report)
                ) as looked,
                count(distinct e.visitor_id) filter (
                  where not coalesce(v.is_bot, false)
                    and (v.priced_vehicle or v.set_salary
                         or v.visited_compare or v.visited_report)
                ) as engaged,
                count(distinct e.visitor_id) filter (where coalesce(v.is_bot, false)) as bots
           from visitor_events e
           join visitors v on v.id = e.visitor_id
          where e.created_at >= now() - ($1::int + 1) * interval '1 day'
          group by 1
       ) c on c.day = d::date
      order by d`,
    [days],
  );
  return r.rows.map((row) => ({ ...row, uniques: row.looked + row.engaged }));
}
