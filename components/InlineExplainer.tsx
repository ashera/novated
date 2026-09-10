"use client";

import { useState, type ReactNode } from "react";

/**
 * A nested explainer for use *inside* an Explainer modal. Renders a figure row
 * (label + value) with a small lightbulb that expands a compact explanation
 * panel in place — no second modal. Keeps the parent explanation in view.
 */
export default function InlineExplainer({
  label,
  value,
  valueClassName = "text-ink",
  children,
}: {
  label: string;
  value: string;
  valueClassName?: string; // colour the value (e.g. green/amber for net rent)
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-line py-1.5 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted">
          {label}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`Explain ${label}`}
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-accent transition hover:bg-accent/20 ${
              open ? "bg-accent/20" : "bg-accent/5"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.4 14.4 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
              />
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </span>
        <span className={`font-semibold tabular-nums ${valueClassName}`}>{value}</span>
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-accent/25 bg-accent/5 p-3 text-xs leading-relaxed text-ink">
          {children}
        </div>
      )}
    </div>
  );
}
