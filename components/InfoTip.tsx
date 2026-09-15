"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A small "ⓘ" that reveals a short explanation, for recovering the vertical
 * space a permanent helper line would take while keeping the detail one
 * interaction away.
 *
 * It used to open on hover and focus-within alone, which meant it did not open
 * at all on a phone: there is no hover to give, and Safari does not focus a
 * <button> when you tap it. So the icon was visible, looked interactive, and
 * did nothing — worse than not being there, because a reader who can see an
 * explanation exists and cannot reach it is told the page is broken.
 *
 * Now it is a real toggle. Tap or click opens it and closes it again; hover
 * still works on a pointer device, so nothing about the desktop behaviour
 * changes. Escape and a tap anywhere else dismiss it, which is what a person
 * tries first.
 *
 * Visibility is driven entirely by state rather than by CSS :hover and
 * :focus-within. Leaving those rules in place made the second tap do nothing:
 * the tap focuses the button, focus-within pins the tooltip open, and the
 * toggle flips a state nothing was reading. So hover is subscribed to only for
 * a mouse — a pointerType check, not a media query guess — and focus opens it
 * only when focus arrived from the keyboard, which is what :focus-visible
 * means and precisely the distinction that was missing.
 *
 * The text moved off aria-label and onto the tooltip the button describes. As
 * a label it made the accessible name of the control the whole paragraph, so a
 * screen reader read three sentences of tax law where it wanted a button name.
 */
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // pointerdown rather than click: it fires before the tap lands on whatever
    // is underneath, so dismissing never also presses something.
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={`relative inline-flex align-middle ${className}`}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-label="More information"
        aria-expanded={open}
        aria-describedby={id}
        onClick={(e) => {
          // A mouse click arrives on something hover has already opened, so
          // toggling there closes what the pointer is still pointing at —
          // "I clicked the info icon and the info went away". Hover governs
          // the mouse; the toggle is for touch and for the keyboard, where
          // pointerType is empty.
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
          setOpen((o) => !o);
        }}
        // Keyboard focus should reveal it; the focus a tap leaves behind
        // should not, or the toggle can never close.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted/50 text-[10px] font-semibold leading-none text-muted transition hover:border-accent hover:text-accent"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-56 max-w-[70vw] -translate-x-1/2 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-normal leading-snug text-ink shadow-xl transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
