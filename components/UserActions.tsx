"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setUserAdmin,
  setUserSuspended,
  deleteUser,
  adminResetPassword,
  type UserAdminResult,
} from "@/app/actions/users";

export default function UserActions({
  userId,
  email,
  isAdmin,
  suspended,
  isSelf,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const act = (fn: () => Promise<UserAdminResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else {
        setError(null);
        if (onOk) onOk();
        else router.refresh();
      }
    });

  const doReset = () =>
    start(async () => {
      const r = await adminResetPassword(userId);
      if (r?.error) {
        setError(r.error);
        setResetLink(null);
      } else {
        setError(null);
        setResetLink(r.link ?? null);
        setEmailed(!!r.emailed);
        setCopied(false);
      }
    });

  const btn = "rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-ink disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btn}
          disabled={pending || isSelf}
          onClick={() => act(() => setUserAdmin(userId, !isAdmin))}
        >
          {isAdmin ? "Revoke admin" : "Make admin"}
        </button>
        <button
          className={btn}
          disabled={pending || isSelf}
          onClick={() => act(() => setUserSuspended(userId, !suspended))}
        >
          {suspended ? "Reinstate account" : "Suspend account"}
        </button>
        <button className={btn} disabled={pending} onClick={doReset}>
          Reset password
        </button>
        <button
          className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-1.5 text-sm font-medium text-danger-text transition hover:bg-danger-subtle disabled:opacity-40"
          disabled={pending || isSelf}
          onClick={() => {
            if (window.confirm(`Permanently delete ${email} and all their saved plans? This can't be undone.`)) {
              act(() => deleteUser(userId), () => router.push("/admin/users"));
            }
          }}
        >
          Delete user
        </button>
      </div>
      {isSelf && (
        <p className="text-xs text-muted">
          That&apos;s you — you can&apos;t change your own role or status here (reset still works).
        </p>
      )}
      {error && <p className="text-xs text-danger-text">{error}</p>}

      {resetLink && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
          <p className="mb-2 text-ink">
            {emailed
              ? "A password-reset link was emailed to the user. You can also copy it below (valid 1 hour):"
              : "Email isn't configured — share this reset link with the user (valid 1 hour):"}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={resetLink}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded border border-line bg-panel-2 px-2 py-1 text-[11px] text-ink"
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(resetLink);
                setCopied(true);
              }}
              className="shrink-0 rounded border border-line px-2 py-1 font-medium text-ink transition hover:text-ink"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
