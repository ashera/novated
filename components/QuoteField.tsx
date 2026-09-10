"use client";

/**
 * One transcribed figure from a provider's quote.
 *
 * Deliberately a plain number box rather than the slider-backed <Field> used on
 * the calculator: here the user is copying an exact figure off a document, not
 * exploring a range, and a slider would fight them.
 *
 * `alsoCalled` carries the other names providers give the same line. The three
 * sampled quotes called the finance line "Lease Payment", "Repayments" and
 * "Lease Rental" — so the label alone is not enough to find it on the page in
 * front of you.
 */
export default function QuoteField({
  label,
  alsoCalled,
  value,
  onChange,
  prefix = "$",
  suffix,
  placeholder,
  hint,
}: {
  label: string;
  alsoCalled?: string[];
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  prefix?: string | null;
  suffix?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {alsoCalled && alsoCalled.length > 0 && (
          <span className="text-[11px] text-muted">
            also “{alsoCalled.join("”, “")}”
          </span>
        )}
      </span>
      <span className="mt-1 flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-1.5 focus-within:border-accent">
        {prefix && <span className="text-xs text-muted">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = parseFloat(raw);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
          className="w-full bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}
