"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback } from "@/app/actions/feedback";

const SENTIMENTS = [
  { key: "love", emoji: "😍", label: "Love it" },
  { key: "ok", emoji: "🙂", label: "It's OK" },
  { key: "frustrated", emoji: "😕", label: "Frustrating" },
];

// Hide the widget on backoffice and print/report surfaces.
const HIDDEN_PREFIXES = ["/admin", "/report", "/audit"];

export default function FeedbackButton() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  function close() {
    setOpen(false);
    // Reset after the close animation so a re-open starts clean.
    setTimeout(() => {
      setDone(false);
      setError(null);
      if (done) {
        setMessage("");
        setEmail("");
        setSentiment(null);
      }
    }, 200);
  }

  async function send() {
    setError(null);
    if (message.trim().length < 2) {
      setError("Please add a little more detail.");
      return;
    }
    setSending(true);
    const res = await submitFeedback({
      message,
      email,
      sentiment: sentiment ?? undefined,
      path: pathname,
    });
    setSending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Share feedback"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-panel/95 px-4 py-2.5 text-sm font-semibold text-accent shadow-lg backdrop-blur transition hover:border-accent hover:bg-accent hover:text-white print:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Share feedback">
          <div className="absolute inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-accent">Help shape LeaseWiz</div>
                <h2 className="mt-1 text-lg font-bold text-ink">Your feedback</h2>
              </div>
              <button onClick={close} aria-label="Close" className="rounded-lg p-1 text-muted transition hover:bg-panel-2 hover:text-ink">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {done ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl">🙏</div>
                <p className="text-lg font-semibold text-ink">Thank you!</p>
                <p className="mt-2 text-sm text-muted">
                  Every note genuinely helps us make LeaseWiz better. We read all of it.
                </p>
                <button
                  onClick={close}
                  className="mt-6 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="overflow-y-auto px-6 py-5">
                <p className="text-sm leading-relaxed text-ink">
                  LeaseWiz is a <strong className="text-ink">new tool that we&apos;re actively building and
                  improving every day.</strong> If something is confusing, missing, or wrong — or you just
                  have an idea — we&apos;d value your thoughts <em>immensely</em>. It shapes what we build next.
                </p>

                {/* Sentiment */}
                <div className="mt-5 flex gap-2">
                  {SENTIMENTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSentiment(sentiment === s.key ? null : s.key)}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition ${
                        sentiment === s.key
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-panel-2 text-muted hover:text-ink"
                      }`}
                    >
                      <span className="text-xl leading-none">{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Your feedback</span>
                  <textarea
                    autoFocus
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="What's working, what's not, what would make this more useful for you?"
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Email <span className="normal-case text-muted/70">— optional, only if you&apos;d like a reply</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>

                {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button onClick={close} className="text-sm text-muted transition hover:text-ink">Cancel</button>
                  <button
                    onClick={send}
                    disabled={sending}
                    className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
                  >
                    {sending ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
