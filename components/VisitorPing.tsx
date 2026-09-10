"use client";

import { useEffect, useRef } from "react";
import { trackVisit, type VisitEvent } from "@/app/actions/track";

/** Fire a single anonymous-visitor tracking event when this mounts (once). Render
 *  it only for signed-out visitors — the server action no-ops for signed-in users,
 *  but not rendering it avoids the needless round-trip. */
export default function VisitorPing({ event }: { event: VisitEvent }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void trackVisit({ event, webdriver: navigator.webdriver === true });
  }, [event]);
  return null;
}
