import Link from "next/link";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { disconnectGoogle, logout } from "@/app/actions/auth";
import { googleConfigured } from "@/lib/googleAuth";

export const metadata = { title: "Your account", robots: { index: false } };

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  linked: { tone: "ok", text: "Google connected — you can now sign in with Google." },
  disconnected: { tone: "ok", text: "Google disconnected." },
  google_in_use: { tone: "error", text: "That Google account is already linked to another LeaseWiz account." },
  no_password: { tone: "error", text: "Set a password first (use “Forgot password”) so you don’t lose access, then disconnect Google." },
  google_cancelled: { tone: "error", text: "Connecting Google was cancelled." },
  google_state: { tone: "error", text: "That link expired — please try again." },
  google_email_unverified: { tone: "error", text: "Your Google email isn’t verified." },
  google_failed: { tone: "error", text: "Connecting Google failed — please try again." },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; disconnected?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const r = await query<{
    email: string;
    name: string | null;
    avatar_url: string | null;
    google_sub: string | null;
    has_password: boolean;
    created_at: string;
  }>(
    `select email, name, avatar_url, google_sub,
            password_hash is not null as has_password, created_at
       from users where id = $1`,
    [user.id],
  );
  const acct = r.rows[0];
  const googleLinked = Boolean(acct.google_sub);

  const sp = await searchParams;
  const noticeKey = sp.linked ? "linked" : sp.disconnected ? "disconnected" : sp.error;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  const memberSince = new Date(acct.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-line bg-panel p-8">
        <Link href="/" className="mb-6 flex justify-center" aria-label="LeaseWiz home">
          <Logo className="h-10 w-auto" />
        </Link>
        <h1 className="text-2xl font-bold text-ink">Your account</h1>

        {notice && (
          <p
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              notice.tone === "ok"
                ? "border-success/40 bg-success-subtle text-success-text"
                : "border-danger/40 bg-danger-subtle text-danger-text"
            }`}
          >
            {notice.text}
          </p>
        )}

        {/* Profile */}
        <div className="mt-6 flex items-center gap-4">
          {acct.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={acct.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-2 text-xl font-semibold text-ink ring-1 ring-line">
              {(acct.name ?? acct.email).charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            {acct.name && <div className="truncate text-lg font-semibold text-ink">{acct.name}</div>}
            <div className="truncate text-sm text-muted">{acct.email}</div>
            <div className="text-xs text-muted/70">Member since {memberSince}</div>
          </div>
        </div>

        {/* Sign-in methods */}
        <div className="mt-6 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Sign-in methods</h2>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-ink">Password</div>
              <div className="text-xs text-muted">
                {acct.has_password ? "Set" : "Not set"}
              </div>
            </div>
            {!acct.has_password && (
              <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
                Set a password
              </Link>
            )}
          </div>

          {googleConfigured() && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-ink">Google</div>
                <div className="text-xs text-muted">{googleLinked ? "Connected" : "Not connected"}</div>
              </div>
              {googleLinked ? (
                <form action={disconnectGoogle}>
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:border-danger/40 hover:text-ink"
                  >
                    Disconnect
                  </button>
                </form>
              ) : (
                <a
                  href="/api/auth/google?link=1"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-ink"
                >
                  Connect
                </a>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Link href="/" className="text-sm text-muted hover:text-ink">
            ← Back to the calculator
          </Link>
          <form action={logout}>
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
