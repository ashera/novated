import "server-only";
import { query } from "./db";

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  user_email: string | null; // joined from users, if signed in
  email: string | null; // reply-to they typed
  sentiment: string | null; // love | ok | frustrated
  message: string;
  path: string | null;
  user_agent: string | null;
  handled: boolean;
  created_at: string;
}

export async function listFeedback(): Promise<FeedbackRow[]> {
  const r = await query<FeedbackRow>(
    `select f.id, f.user_id, u.email as user_email, f.email, f.sentiment,
            f.message, f.path, f.user_agent, f.handled, f.created_at
       from feedback f
       left join users u on u.id = f.user_id
      order by f.created_at desc`,
  );
  return r.rows;
}
