"use client";

/**
 * A small "ⓘ" info icon that reveals a short explanation on hover/focus — for
 * recovering the vertical space a permanent helper line would take, while keeping
 * the detail one interaction away. Accessible (focusable, tooltip on focus-within).
 */
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted/50 text-[10px] font-semibold leading-none text-muted transition hover:border-accent hover:text-accent"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-56 max-w-[70vw] -translate-x-1/2 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-normal leading-snug text-ink opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
