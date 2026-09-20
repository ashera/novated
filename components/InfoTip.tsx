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
 *
 * And it STILL did not work on a phone, for a reason none of that touched: the
 * icon is 16px square, and a 16px target is about a third of the 44px a thumb
 * needs. Driven from a script, which taps the exact centre every time, the
 * toggle passed; held in a hand it mostly missed. So the hit area is now a
 * 44px box centred on the icon, added as a pseudo-element so the icon stays
 * the size it is drawn and nothing in the line around it moves.
 *
 * And it STILL did not open, on Safari only, for the reason the
 * mouse-versus-touch guard below was written to handle. Safari fires
 * pointerdown and pointerup with pointerType "touch", correctly — and then
 * fires the click with pointerType "mouse". Reading the type off the click
 * therefore classified every tap on an iPhone as a mouse click and returned
 * without toggling. Chromium reports "touch" there, which is why every test
 * written against it passed while the thing remained broken in a hand.
 *
 * So the type is taken from pointerdown, which is the event that tells the
 * truth, and remembered for the click that follows. A keyboard activation
 * fires no pointerdown at all, so the remembered value is empty and the toggle
 * runs — which is what a keyboard wants.
 *
 * The tooltip is also clamped to the viewport. Centred under a 16px icon, a
 * 224px panel hangs 112px either side — which runs off the screen whenever the
 * icon sits near an edge, and an explanation half off the page is the same
 * failure as no explanation. It is measured once on open and nudged back
 * inside, which is the only way to do it: the overflow depends on where the
 * icon happens to land, and CSS cannot see that.
 */
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  /** Horizontal nudge, in px, that keeps the panel on screen. */
  const [shift, setShift] = useState(0);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  /** What kind of pointer started the current interaction. Empty for the
   *  keyboard, which fires no pointer events before its click. */
  const via = useRef("");

  /*
   * Kept inside the viewport whether it is showing or not.
   *
   * This was measured only on open, and reset to zero on close — which fixed
   * what a reader could see and left the page still scrolling sideways. The
   * panel is absolutely positioned and stays in the layout while hidden, so a
   * closed tooltip 8px past the right edge drags the whole document with it.
   * On a 390px phone the home page had exactly one overflowing element and it
   * was this, invisible.
   *
   * So the measurement subtracts the shift already applied to recover the
   * unshifted position, which makes it safe to run at any time rather than
   * only on the transition into open. It settles in one pass: a second run
   * computes the same shift and React drops the identical state.
   */
  useEffect(() => {
    const el = tip.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const margin = 8;
      const left = r.left - shift;
      const right = r.right - shift;
      if (left < margin) setShift(margin - left);
      else if (right > window.innerWidth - margin) setShift(window.innerWidth - margin - right);
      else setShift(0);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, shift]);

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
        // Recorded here and not read off the click, because Safari reports the
        // click as a mouse event even when a finger caused it. This is the
        // event that says "touch" on a phone.
        onPointerDown={(e) => {
          via.current = e.pointerType;
        }}
        onClick={() => {
          // A mouse click arrives on something hover has already opened, so
          // toggling there closes what the pointer is still pointing at —
          // "I clicked the info icon and the info went away". Hover governs
          // the mouse; the toggle is for touch and for the keyboard, which
          // reaches here with nothing recorded.
          const mouse = via.current === "mouse";
          via.current = "";
          if (mouse) return;
          setOpen((o) => !o);
        }}
        // Keyboard focus should reveal it; the focus a tap leaves behind
        // should not, or the toggle can never close.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        /* The ::before is the tap target: 44px square, centred on the icon,
           and invisible. Laid out absolutely so the icon keeps its 16px
           footprint and the text beside it does not shift. */
        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted/50 text-[10px] font-semibold leading-none text-muted transition before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:border-accent hover:text-accent"
      >
        i
      </button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-panel px-3 py-2 text-xs font-normal leading-snug text-ink shadow-xl transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
