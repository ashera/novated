"use client";

import { useActionState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import type { AuthState } from "@/app/actions/auth";

const OAUTH_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn’t available right now.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in link expired — please try again.",
  google_email_unverified: "Your Google email isn’t verified, so we can’t sign you in.",
  google_failed: "Google sign-in failed — please try again.",
  suspended: "This account has been suspended.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function AuthForm({
  mode,
  action,
  googleEnabled = false,
  oauthError = null,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  googleEnabled?: boolean;
  oauthError?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";
  const oauthMessage = oauthError ? OAUTH_ERRORS[oauthError] ?? "Sign-in failed — please try again." : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-line bg-panel p-8">
        <Link href="/" className="mb-6 flex justify-center" aria-label="LeaseWiz home">
          <Logo className="h-12 w-auto" />
        </Link>
        <h1 className="text-2xl font-bold text-ink">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin
            ? "Log in to load your saved plans."
            : "Save and compare your lease scenarios."}
        </p>

        {oauthMessage && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {oauthMessage}
          </p>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm text-ink">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-ink outline-none transition focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm text-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-ink outline-none transition focus:border-accent"
            />
          </div>
          {isLogin && (
            <p className="text-right text-xs">
              <Link href="/forgot-password" className="text-muted hover:text-accent">
                Forgot password?
              </Link>
            </p>
          )}
          {state.error && <p className="text-sm text-danger-text">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
          >
            {pending ? "…" : isLogin ? "Log in" : "Sign up"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs uppercase tracking-wide text-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 font-medium text-[#3c4043] transition hover:bg-slate-100"
            >
              <GoogleIcon />
              Continue with Google
            </a>
          </>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          {isLogin ? (
            <>
              No account?{" "}
              <Link href="/signup" className="text-accent hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Have an account?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Log in
              </Link>
            </>
          )}
        </p>
        <p className="mt-4 text-center">
          <Link href="/" className="text-xs text-muted hover:text-ink">
            ← Back to the calculator
          </Link>
        </p>
      </div>
    </main>
  );
}
