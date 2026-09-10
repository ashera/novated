// Tiny wrapper over whichever analytics provider is loaded. Each call is a no-op
// unless that provider's script is present (Plausible via NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
// GA4 via NEXT_PUBLIC_GA_ID), so it's safe to sprinkle track() calls anywhere
// without guarding — events flow to every configured provider at once.
type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props; callback?: () => void }) => void;
    gtag?: (command: "event", event: string, params?: Props) => void;
  }
}

// GA4 event names allow only letters, numbers and underscores (max 40 chars), so
// "Compare: saved added" -> "compare_saved_added". Plausible keeps the readable name.
function gaEventName(event: string) {
  return event
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Optional sink that also records events to our own visitor activity log. Injected
// by <VisitorActivity> for signed-out visitors (kept as an injected fn so this file
// stays free of any server-action import). Null = not recording.
type VisitorLogger = (event: string, props?: Props) => void;
let visitorLogger: VisitorLogger | null = null;
export function setVisitorLogger(fn: VisitorLogger) {
  visitorLogger = fn;
}
export function clearVisitorLogger() {
  visitorLogger = null;
}

export function track(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  window.plausible?.(event, props ? { props } : undefined);
  window.gtag?.("event", gaEventName(event), props);
  visitorLogger?.(event, props);
}

// Google Ads conversion event. The conversion action in Google Ads is linked to
// this event name; firing it (once the AW-… tag is configured) records the
// conversion. No-op when the Ads tag isn't loaded. `onceKey` de-dupes per browser
// so an activation conversion (e.g. "built a plan") counts a user only once.
export function trackConversion(eventName: string, onceKey?: string, params?: Props) {
  if (typeof window === "undefined") return;
  if (onceKey) {
    try {
      if (localStorage.getItem(onceKey)) return;
      localStorage.setItem(onceKey, "1");
    } catch {
      /* storage blocked — fall through and still fire */
    }
  }
  window.gtag?.("event", eventName, params);
}

/** Fires the Google Ads conversion the first time a visitor prices a lease. */
export function trackLeasePricedConversion() {
  trackConversion("conversion_event_page_view", "lw_conv_lease_priced");
}
