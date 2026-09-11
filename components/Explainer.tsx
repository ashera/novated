"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Reusable "explain this number" affordance. Renders a small help icon that
 * shows an "Explain this to me" tooltip on hover and opens a modal with the
 * supplied explanation on click. Drop one into any StatCard via its
 * `explainer` prop, passing scenario-specific content as children.
 */
export default function Explainer({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes it. Without this the only ways out were the ✕ and the
  // scrim, and a modal that ignores Escape reads as stuck — it also traps
  // anyone driving the page from the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* A quiet affordance, not a beacon. This sits beside a section heading
          on a page people read for a while; the original pulsing emerald glow
          was both off-palette and impossible to stop noticing. */}
      <span className="group relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Explain this to me"
          className="relative flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel-2 text-accent transition hover:border-accent hover:bg-accent-subtle"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.4 14.4 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </button>
        <span className="pointer-events-none absolute right-0 top-9 z-20 w-max rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-lg transition group-hover:opacity-100">
          Explain this to me
        </span>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-[#091e42]/54 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                <span aria-hidden>💡</span>
                <h2 className="text-lg font-bold text-ink">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
