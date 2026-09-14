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
  readOnly = false,
  check,
}: {
  label: string;
  alsoCalled?: string[];
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  prefix?: string | null;
  suffix?: string;
  placeholder?: string;
  hint?: string;
  /** Shown, not edited — a locked quote is a record of what a provider sent. */
  readOnly?: boolean;
  /**
   * A figure that cannot be true, or is unusual enough to re-read.
   *
   * Beside the box rather than in the findings below, because it is about
   * what was just typed: everything the page derives from a wrong figure is
   * confidently wrong, and there is nothing on screen to say so.
   */
  check?: { level: "error" | "warn"; message: string } | null;
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
      <span
        className={`mt-1 flex items-center gap-1 rounded-md border px-2 py-1.5 ${
          check?.level === "error"
            ? "border-danger bg-danger-subtle"
            : check?.level === "warn"
              ? "border-warning bg-warning-subtle"
              : "border-line"
        } ${readOnly ? "bg-panel-3" : check ? "" : "bg-panel-2 focus-within:border-accent"}`}
      >
        {prefix && <span className="text-xs text-muted">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value ?? ""}
          placeholder={readOnly ? "" : placeholder}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = parseFloat(raw);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
          className="w-full bg-transparent text-right text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </span>
      {check ? (
        <span
          role={check.level === "error" ? "alert" : undefined}
          className={`mt-1 flex items-start gap-1.5 text-[11px] leading-snug ${
            check.level === "error" ? "text-danger-text" : "text-warning-text"
          }`}
        >
          <span aria-hidden className="mt-px shrink-0 font-semibold">
            {check.level === "error" ? "!" : "?"}
          </span>
          <span>{check.message}</span>
        </span>
      ) : (
        hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>
      )}
    </label>
  );
}
