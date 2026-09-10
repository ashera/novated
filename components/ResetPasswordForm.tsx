"use client";

import { useActionState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { resetPassword, type AuthState } from "@/app/actions/auth";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {} as AuthState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-line bg-panel p-8">
        <Link href="/" className="mb-6 flex justify-center" aria-label="LeaseWiz home">
          <Logo className="h-12 w-auto" />
        </Link>

        <h1 className="text-2xl font-bold text-ink">Set a new password</h1>

        {token ? (
          <form action={formAction} className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label htmlFor="password" className="text-sm text-ink">
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-ink outline-none transition focus:border-accent"
              />
              <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
            </div>
            {state.error && <p className="text-sm text-danger-text">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
            >
              {pending ? "…" : "Update password & sign in"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted">
            This reset link is missing or invalid.{" "}
            <Link href="/forgot-password" className="text-accent hover:underline">
              Request a new one
            </Link>
            .
          </p>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
