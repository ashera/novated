"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CountryFlag from "@/components/CountryFlag";
import { explainLocation, type LocationBasis } from "@/app/actions/geoBasis";

const POPOVER_W = 288; // w-72

/** A country flag that, when clicked, explains how that location was determined —
 *  method (IP geolocation vs proxy header), the IP, the live GeoLite match
 *  (region/city/timezone/coords/accuracy) and the corroborating locale. The popover
 *  is portalled + fixed-positioned so the table's overflow container can't clip it. */
export default function FlagWithBasis({
  kind,
  id,
  code,
  showName = false,
}: {
  kind: "visitor" | "user";
  id: string;
  code: string | null;
  showName?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<LocationBasis | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(r.left, window.innerWidth - POPOVER_W - 12);
    setPos({ top: r.bottom + 6, left: Math.max(12, left) });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false); // fixed popover shouldn't drift on scroll
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  if (!code) return <span className="text-muted">—</span>;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !basis && !loading) {
      setLoading(true);
      try {
        setBasis(await explainLocation(kind, id));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="How was this determined?"
        className="cursor-pointer rounded transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <CountryFlag code={code} showName={showName} showCode={!showName} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={pop}
            style={{ top: pos.top, left: pos.left, width: POPOVER_W }}
            className="fixed z-50 rounded-xl border border-line bg-panel p-3 text-left text-xs shadow-2xl"
          >
            <div className="mb-2 flex items-center gap-2 border-b border-line/60 pb-2">
              <CountryFlag code={code} showName />
            </div>
            {loading && <p className="text-muted">Checking…</p>}
            {!loading && basis && !basis.ok && <p className="text-danger-text">{basis.error}</p>}
            {!loading && basis?.ok && (
              <dl className="space-y-1.5">
                <Row label="Method" value={basis.method} />
                {basis.ip ? (
                  <Row label="IP address" value={basis.ip} mono />
                ) : (
                  <Row label="IP address" value="Not retained" muted />
                )}
                {basis.city && <Row label="City" value={basis.city} />}
                {basis.region && <Row label="Region" value={basis.region} />}
                {basis.timezone && <Row label="Timezone" value={basis.timezone} />}
                {basis.coordinates && <Row label="Coordinates" value={basis.coordinates} mono />}
                {basis.accuracyKm != null && <Row label="Accuracy" value={`~${basis.accuracyKm} km radius`} />}
                {basis.locale && <Row label="Browser locale" value={basis.locale} mono />}
                {basis.storedMatchesLive != null && (
                  <Row
                    label="Re-check"
                    value={basis.storedMatchesLive ? "GeoLite still agrees ✓" : "GeoLite now differs"}
                    muted={basis.storedMatchesLive}
                    warn={!basis.storedMatchesLive}
                  />
                )}
                {basis.note && <p className="pt-1 text-[11px] leading-relaxed text-muted">{basis.note}</p>}
              </dl>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function Row({
  label,
  value,
  mono = false,
  muted = false,
  warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono " : ""}${warn ? "text-warning-text" : muted ? "text-muted" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}
