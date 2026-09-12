"use client";

import type { QuoteFrequency } from "@/lib/au/quote";
import type { Provider } from "@/lib/au/providers";
import ProviderPicker from "./ProviderPicker";

/**
 * Which quote you are transcribing, and what period its figures are in.
 *
 * These two sit at the top of the vehicle card on the decoder, directly under
 * the lease name, because they identify the document in front of you — they
 * are not part of the long list of figures copied off it. The frequency in
 * particular belongs here: get it wrong and every number entered below is out
 * by two or four times, so it needs deciding before the typing starts, not
 * halfway down a form.
 */

const FREQ_LABEL: Record<QuoteFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

export default function QuoteIdentity({
  label,
  onLabel,
  frequency,
  onFrequency,
  providers,
  readOnly = false,
}: {
  label: string;
  onLabel: (v: string) => void;
  frequency: QuoteFrequency;
  onFrequency: (f: QuoteFrequency) => void;
  /** The provider directory, for the name suggestions. */
  providers: Provider[];
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ProviderPicker value={label} onChange={onLabel} providers={providers} readOnly={readOnly} />

      <div>
        <span className="text-sm font-medium text-ink">Figures on your quote are per</span>
        <div className="mt-1 flex gap-1.5">
          {(["weekly", "fortnightly", "monthly"] as QuoteFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              disabled={readOnly}
              onClick={() => onFrequency(f)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                frequency === f
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-line bg-panel-2 text-subtle"
              } ${readOnly ? "cursor-default opacity-70" : "hover:border-line-bold hover:text-ink"}`}
            >
              {FREQ_LABEL[f]}
            </button>
          ))}
        </div>
        {!readOnly && (
          <p className="mt-1.5 text-[11px] text-muted">
            Look for it in the heading above the figures &mdash; providers label it once and never
            repeat it. Get this wrong and every number below is out by two or four times.
          </p>
        )}
      </div>
    </div>
  );
}
