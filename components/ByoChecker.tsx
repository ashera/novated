"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  assessByo,
  emailFor,
  ARRANGEMENT_LABEL,
  EMPLOYER_LABEL,
  POLICY_LABEL,
  SECTOR_NOTE,
  WHO_DECIDES,
  WHO_TO_ASK,
  type Arrangement,
  type ByoAnswers,
  type EmployerKind,
  type PolicySays,
  type Verdict,
} from "@/lib/au/byoProvider";
import { track } from "@/lib/analytics";

/**
 * Three questions, then the email.
 *
 * The result is never a yes or a no, because nothing here can know one — it is
 * an expectation, the reasoning behind it, and the message that gets the real
 * answer out of payroll. The reasons are shown rather than summarised so that
 * somebody whose situation doesn't match can see exactly which assumption to
 * discount.
 *
 * All three questions are on screen at once rather than revealed one at a
 * time. It is a page somebody arrives at already half-suspecting the answer,
 * and a wizard that makes them click through to find out it agrees with them
 * wastes the one thing they came for.
 */

/** Tone per outcome. Only the verdict banner is coloured — the rest stays neutral. */
const TONE: Record<Verdict, { wrap: string; label: string; chip: string }> = {
  several: {
    wrap: "border-success bg-success-subtle",
    label: "text-success-text",
    chip: "bg-success-subtle text-success-text",
  },
  open: {
    wrap: "border-accent-border bg-accent-subtle",
    label: "text-accent",
    chip: "bg-accent-subtle text-accent",
  },
  ask: {
    wrap: "border-accent-border bg-accent-subtle",
    label: "text-accent",
    chip: "bg-accent-subtle text-accent",
  },
  unlikely: {
    wrap: "border-warning bg-warning-subtle",
    label: "text-warning-text",
    chip: "bg-warning-subtle text-warning-text",
  },
};

const VERDICT_CHIP: Record<Verdict, string> = {
  several: "You're already set",
  open: "Nothing in the way",
  ask: "Worth asking",
  unlikely: "Expect a no",
};

function Choice<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  legend: string;
  hint: string;
  options: Record<T, string>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((key) => {
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                on
                  ? "border-accent bg-accent-subtle font-semibold text-accent"
                  : "border-line bg-panel text-subtle hover:border-accent hover:text-accent"
              }`}
            >
              {options[key]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ByoChecker() {
  const [employer, setEmployer] = useState<EmployerKind | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [policy, setPolicy] = useState<PolicySays | null>(null);
  const [copied, setCopied] = useState(false);

  const answers: ByoAnswers | null =
    employer && arrangement && policy ? { employer, arrangement, policy } : null;

  const result = useMemo(() => (answers ? assessByo(answers) : null), [answers]);

  const copy = async () => {
    if (!answers) return;
    try {
      await navigator.clipboard.writeText(emailFor(answers));
      setCopied(true);
      track("BYO email copied", { verdict: result?.verdict ?? "none" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the message is on screen to copy by hand */
    }
  };

  // Answering the last question is the moment the tool did its job.
  const record = (next: Partial<ByoAnswers>) => {
    const merged = { employer, arrangement, policy, ...next };
    if (merged.employer && merged.arrangement && merged.policy) {
      track("BYO checked", {
        employer: merged.employer,
        arrangement: merged.arrangement,
        policy: merged.policy,
        verdict: assessByo(merged as ByoAnswers).verdict,
      });
    }
  };

  return (
    <div className="mt-8">
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Three questions</h2>
        <p className="mt-1 text-sm text-subtle">
          Nothing is sent anywhere and nothing is saved. The answers only decide which version of
          the message you get at the end.
        </p>

        <div className="mt-5 space-y-6">
          <Choice
            legend="1. Who do you work for?"
            hint="Different kinds of employer buy packaging in different ways, which is what sets the norm."
            options={EMPLOYER_LABEL}
            value={employer}
            onChange={(v) => {
              setEmployer(v);
              record({ employer: v });
            }}
          />
          <Choice
            legend="2. Is a packaging provider already set up where you work?"
            hint="Look for a name in your onboarding pack or on the intranet, or a branded portal you'd log into for packaging. If more than one name comes up, that's the second option."
            options={ARRANGEMENT_LABEL}
            value={arrangement}
            onChange={(v) => {
              setArrangement(v);
              record({ arrangement: v });
            }}
          />
          <Choice
            legend="3. Does anything in writing say you must use them?"
            hint="A salary packaging policy, an intranet page, a line in your onboarding pack. Being told 'we use X' in conversation is not the same as it being written down — that distinction is the whole point of this question."
            options={POLICY_LABEL}
            value={policy}
            onChange={(v) => {
              setPolicy(v);
              record({ policy: v });
            }}
          />
        </div>

        {!result && (
          <p className="mt-6 rounded-lg border border-line bg-panel-2 px-3.5 py-3 text-sm text-muted">
            Answer all three and you&apos;ll get what to expect, why, and the message to send
            payroll.
          </p>
        )}
      </section>

      {result && answers && (
        <div className="mt-5 space-y-5">
          <section className={`rounded-xl border p-5 ${TONE[result.verdict].wrap}`}>
            <span
              className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONE[result.verdict].chip}`}
            >
              {VERDICT_CHIP[result.verdict]}
            </span>
            <h2 className={`mt-2 text-lg font-semibold ${TONE[result.verdict].label}`}>
              {result.headline}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">{result.detail}</p>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold text-ink">Why we said that</h2>
            <p className="mt-1 text-sm text-subtle">
              If one of these doesn&apos;t match your situation, discount it — this is reasoning,
              not a ruling.
            </p>
            <ul className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed text-subtle">
              {result.reasons.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 shrink-0 text-muted">
                    ·
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Send this to payroll</h2>
                <p className="mt-1 max-w-2xl text-sm text-subtle">{WHO_TO_ASK}</p>
              </div>
              <button
                type="button"
                onClick={copy}
                className="rounded bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
              >
                {copied ? "Copied" : "Copy the message"}
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm text-ink marker:font-semibold marker:text-accent">
              {result.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold text-ink">
              {result.verdict === "several" ? "If one won't quote" : "If the answer is no"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-subtle">{result.ifNo}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/decode"
                className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
              >
                Decode the quote you can get
              </Link>
              <Link
                href="/"
                className="inline-flex rounded border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
              >
                Back to the calculator
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel-2 p-5">
            <h2 className="text-sm font-semibold text-ink">
              What&apos;s usual where you work
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-subtle">
              {SECTOR_NOTE[answers.employer]}
            </p>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">{WHO_DECIDES}</p>
          </section>
        </div>
      )}
    </div>
  );
}
