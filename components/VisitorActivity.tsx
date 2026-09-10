"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setVisitorLogger, clearVisitorLogger } from "@/lib/analytics";
import { logVisitorEvent } from "@/app/actions/track";

/** Records a signed-out visitor's activity: page views (on mount + route change) and
 *  every named track() event (bridged into our own log). Render it only for
 *  anonymous visitors — the server action also drops signed-in users defensively. */
export default function VisitorActivity() {
  const pathname = usePathname();

  // Establish the visitor cookie synchronously (before any tracking server action)
  // so the very first page's events can attach immediately and no duplicate visitor
  // row is created in the race. trackVisit later re-sets it server-side (same key,
  // kept JS-visible so this check keeps finding it on return visits — see track.ts).
  useEffect(() => {
    try {
      if (!document.cookie.split("; ").some((c) => c.startsWith("lw_visitor="))) {
        const key = crypto.randomUUID().replace(/-/g, "");
        document.cookie = `lw_visitor=${key}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch {
      /* cookies blocked — logging just no-ops */
    }
    // Bridge the client analytics stream (Budget opened, Guide completed, Year
    // breakdown opened, …) into the visitor log for as long as this is mounted.
    setVisitorLogger((event, props) => {
      void logVisitorEvent({ event, path: window.location.pathname, props });
    });
    return () => clearVisitorLogger();
  }, []);

  // A page view on first mount and on every client-side route change.
  useEffect(() => {
    void logVisitorEvent({ event: "pageview", path: pathname });
  }, [pathname]);

  return null;
}
