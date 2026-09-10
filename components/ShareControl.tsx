"use client";

import { useState } from "react";
import { createShareLink, revokeShareLink } from "@/app/actions/plans";

/** Per-scenario share control: mints (or reuses) a public read-only link, copies it
 *  to the clipboard, and lets the owner revoke it. Shared by the dashboard's saved-
 *  scenario chip and the report page. `linkPath` is appended after
 *  `/s/<token>` so a surface can share its own view (e.g. "/timeline"). */
export default function ShareControl({
  id,
  initialToken,
  onNotice,
  linkPath = "",
  shareLabel = "🔗 Share",
  copyLabel = "🔗 Copy link",
  copiedNotice = "Share link copied — anyone with it can view this scenario (read-only).",
}: {
  id: string;
  initialToken: string | null;
  onNotice: (msg: string) => void;
  linkPath?: string;
  shareLabel?: string;
  copyLabel?: string;
  copiedNotice?: string;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);

  const linkFor = (t: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/s/${t}${linkPath}`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotice(copiedNotice);
    } catch {
      onNotice(`Share link: ${url}`); // clipboard blocked — show it so they can copy manually
    }
  };

  const share = async () => {
    if (busy) return;
    if (token) return void copy(linkFor(token));
    setBusy(true);
    try {
      const res = await createShareLink(id);
      if (res.token) {
        setToken(res.token);
        await copy(linkFor(res.token));
      } else {
        onNotice(res.error ?? "Couldn't create a share link.");
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeShareLink(id);
      setToken(null);
      onNotice("Share link revoked — the public link no longer works.");
    } finally {
      setBusy(false);
    }
  };

  return token ? (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-panel-2 text-sm">
      <button
        onClick={share}
        disabled={busy}
        title="Copy the public read-only link"
        className="px-3 py-1.5 font-medium text-accent transition hover:bg-accent/10 disabled:opacity-60"
      >
        {copyLabel}
      </button>
      <button
        onClick={revoke}
        disabled={busy}
        title="Disable the public link"
        className="border-l border-line px-2 py-1.5 text-muted transition hover:text-danger-text disabled:opacity-60"
      >
        unshare
      </button>
    </div>
  ) : (
    <button
      onClick={share}
      disabled={busy}
      title="Create a public read-only link to send someone"
      className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-ink disabled:opacity-60"
    >
      {shareLabel}
    </button>
  );
}
