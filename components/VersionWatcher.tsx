"use client";

import { useEffect, useState } from "react";
import { BUILD } from "@/lib/version";

// LeaseWiz is a single-page app, so a tab left open across a deploy keeps running the
// JS it first loaded — which can show stale numbers (e.g. a budget figure computed by
// old logic). This polls the deployed build number and, when it's newer than the one
// baked into this bundle, offers a reload. Checks on an interval and whenever the tab
// regains focus (the moment someone comes back to a long-idle tab).
export default function VersionWatcher() {
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { build?: number };
        if (!cancelled && typeof d.build === "number" && d.build > BUILD) setStale(true);
      } catch {
        /* offline / transient — ignore */
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const id = window.setInterval(check, 5 * 60 * 1000); // every 5 min
    document.addEventListener("visibilitychange", onVisible);
    check(); // once on mount
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 print:hidden">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-full border border-accent/40 bg-panel/95 px-4 py-2.5 text-sm shadow-2xl backdrop-blur"
      >
        <span aria-hidden>✨</span>
        <span className="text-ink">A new version of LeaseWiz is available.</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Reload
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded-full p-1 text-muted transition hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
