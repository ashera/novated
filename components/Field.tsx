"use client";

import { useEffect, useState } from "react";

interface FieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  // Whole-number-only (ages): committed values are rounded to integers and the mobile
  // keypad drops the decimal point. Prevents fractional ages, which offset the whole
  // projection off integer years (e.g. a 50.8 current age → rows at 50.8, 51.8, …).
  integer?: boolean;
  prefix?: string;
  suffix?: string;
  hint?: string;
  // When something else controls this field, lock the input (its value comes from
  // strategy's) and explain where to change it. `value` should be the composed value.
  locked?: boolean;
  lockNote?: React.ReactNode;
}

export default function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = false,
  prefix,
  suffix,
  hint,
  locked = false,
  lockNote,
}: FieldProps) {
  const clamp = (n: number) => {
    const r = integer ? Math.round(n) : n;
    return Math.min(max, Math.max(min, r));
  };

  // The text box holds the RAW text while the user is typing, so a partial entry
  // (e.g. "4" on the way to "45") is never clamped up to `min` mid-keystroke — the
  // bug that made the field snap back. The committed numeric value is still
  // clamped, just not until blur.
  const [text, setText] = useState<string>(Number.isNaN(value) ? "" : String(value));
  const [focused, setFocused] = useState(false);

  // Reflect external value changes (the slider, a reset, or the blur-clamp) into
  // the text — but never while it's being edited, so typing is uninterrupted.
  useEffect(() => {
    if (!focused) setText(Number.isNaN(value) ? "" : String(value));
  }, [value, focused]);

  return (
    <div className="space-y-2">
      <div className={`flex items-baseline justify-between gap-3 ${locked ? "opacity-60" : ""}`}>
        <label className="text-sm font-medium text-ink">{label}</label>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1">
          {prefix && <span className="text-xs text-muted">{prefix}</span>}
          <input
            type="number"
            value={text}
            min={min}
            max={max}
            step={integer ? 1 : step}
            inputMode={integer ? "numeric" : undefined}
            disabled={locked}
            onFocus={() => setFocused(true)}
            onChange={(e) => {
              setText(e.target.value);
              // Update the live preview as they type, clamped so it stays valid —
              // but the text box keeps showing exactly what they typed.
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) onChange(clamp(n));
            }}
            onBlur={() => {
              setFocused(false);
              const n = parseFloat(text);
              const next = Number.isNaN(n) ? min : clamp(n);
              setText(String(next));
              if (next !== value) onChange(next);
            }}
            className="w-24 bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none disabled:cursor-not-allowed"
          />
          {suffix && <span className="text-xs text-muted">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        value={Number.isNaN(value) ? min : value}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        className={`w-full ${locked ? "opacity-60" : ""}`}
      />
      {locked && lockNote ? (
        <p className="text-xs text-warning-text">{lockNote}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
