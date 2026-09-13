"use client";

import { useEffect } from "react";
import {
  SAMPLE_MARKERS,
  SAMPLE_PROVIDER,
  SAMPLE_REFERENCE,
  SAMPLE_SECTIONS,
} from "@/lib/au/sampleQuote";

/**
 * What a quote actually looks like, before you have ever been sent one.
 *
 * Everything else on this site assumes a document is already in front of the
 * user. For a first-time leaser it isn't, and "type in the amount financed"
 * means nothing until they have seen where that sits on a page and what the
 * provider calls it. So this is a facsimile — a plausible quote from an
 * invented company, marked up with what each figure is and why it matters.
 *
 * Two things make it worth the space. The labels are the ones a provider
 * prints rather than the ones we ask for, because the gap between "Vehicle
 * Amount Financed" and "Amount financed" is most of what makes a first quote
 * unreadable. And the figures are the decoder's own worked example, so the
 * document and the findings it produces cannot drift apart: the total really
 * doesn't add up, and marker 8 says so.
 *
 * It is labelled a sample in three places and names a company that does not
 * exist. A mock-up of a financial document has to be impossible to mistake
 * for a real one.
 */
export default function SampleQuote({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="What a provider's quote looks like"
        className="relative z-10 my-8 w-full max-w-4xl rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-lg font-semibold text-ink">What a quote looks like</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              A made-up quote from a made-up company, marked up with what each figure is. Real
              ones vary in layout and wording, but they all carry these same numbers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            {/* ── The document ───────────────────────────────────── */}
            <div className="overflow-hidden rounded-lg border border-line-bold bg-panel-2">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-accent bg-panel px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold tracking-tight text-ink">
                      {SAMPLE_PROVIDER}
                    </span>
                    <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-text">
                      Sample
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
                    Novated Lease Quotation
                  </p>
                </div>
                <dl className="text-right text-[11px] leading-relaxed text-muted">
                  <div>
                    <dt className="inline">Quote No.&nbsp;</dt>
                    <dd className="inline font-medium text-subtle">{SAMPLE_REFERENCE}</dd>
                  </div>
                  <div>
                    <dt className="inline">Prepared for&nbsp;</dt>
                    <dd className="inline font-medium text-subtle">A. Sample</dd>
                  </div>
                  <div>
                    <dt className="inline">Valid&nbsp;</dt>
                    <dd className="inline font-medium text-subtle">14 days</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-4 px-4 py-3.5">
                {SAMPLE_SECTIONS.map((section) => (
                  <section key={section.heading}>
                    <div className="flex items-center gap-2 border-b border-line pb-1">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                        {section.heading}
                      </h3>
                      {section.markerOnHeading != null && <Marker n={section.markerOnHeading} />}
                    </div>
                    {section.note && (
                      <p className="mt-1 text-[11px] italic text-muted">{section.note}</p>
                    )}
                    <dl className="mt-1.5">
                      {section.lines.map((line) => (
                        <div
                          key={line.label}
                          className={`flex items-baseline justify-between gap-3 py-1 ${
                            line.total ? "border-t border-line font-semibold text-ink" : ""
                          }`}
                        >
                          <dt className="flex items-center gap-2 text-[13px] text-subtle">
                            {line.label}
                            {line.marker != null && <Marker n={line.marker} />}
                          </dt>
                          <dd className="whitespace-nowrap text-[13px] tabular-nums text-ink">
                            {line.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}

                <p className="border-t border-line pt-2.5 text-[10px] leading-relaxed text-muted">
                  Illustrative only. {SAMPLE_PROVIDER} is not a real company and these figures are
                  not an offer. Running-cost amounts are estimates and are reconciled against
                  actual expenditure.
                </p>
              </div>
            </div>

            {/* ── The mark-up ────────────────────────────────────── */}
            <div>
              <h3 className="text-sm font-semibold text-ink">What to look for</h3>
              <ol className="mt-2.5 space-y-3">
                {SAMPLE_MARKERS.map((m) => (
                  <li key={m.marker} className="flex gap-2.5">
                    <Marker n={m.marker} />
                    <div>
                      <p className="text-[13px] font-semibold leading-snug text-ink">{m.title}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{m.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* What we call each of them, which is the other half of the job. */}
          <div className="mt-5 rounded-lg border border-line bg-panel-2 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">
              The same figures, in the words we use
            </h3>
            <p className="mt-1 text-[12px] text-muted">
              No two providers label these the same way, which is why our form lists the
              alternatives beside each field.
            </p>
            <ul className="mt-2.5 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {SAMPLE_SECTIONS.flatMap((s) => s.lines)
                .filter((l) => l.field)
                .map((l) => (
                  <li
                    key={l.label}
                    className="flex items-baseline justify-between gap-2 border-b border-line py-1 text-[12px]"
                  >
                    <span className="text-muted">{l.label}</span>
                    <span className="shrink-0 font-medium text-subtle">{l.field}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            Got it
          </button>
          <span className="text-[11px] text-muted">
            Ask a provider for one of these, then add it and we&apos;ll take it apart.
          </span>
        </div>
      </div>
    </div>
  );
}

/** The numbered tie between a line on the document and the note about it. */
function Marker({ n }: { n: number }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold tabular-nums text-white">
      {n}
    </span>
  );
}
