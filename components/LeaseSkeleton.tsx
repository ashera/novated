/**
 * The page's shape, while the lease is being fetched.
 *
 * A skeleton rather than a spinner, because the complaint is not that nothing
 * happens — it is that something happens twice. The store starts on defaults
 * and swaps to the real lease once local storage or the account answers, so a
 * reader sees a $55,000 electric car they never chose, then their own, and the
 * jump is the jarring part.
 *
 * A spinner would fix the wrong half: it would remove the false figures but
 * still reflow the whole page when it disappeared. Blocks the size of the
 * cards that replace them mean nothing moves — which is the point — and they
 * say "your data is on its way" rather than "something is happening".
 *
 * The hero above it is not gated. It is the same for every reader, it is what
 * a crawler and a cold visitor should see immediately, and gating it would
 * trade one flash for a blank page.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-panel-2 ${className}`} />;
}

export default function LeaseSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your lease…</span>

      {/* The car card: a picture and its facts. */}
      <div className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <Block className="h-8 w-56" />
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:gap-6">
          <Block className="h-44 w-full shrink-0 sm:h-52 sm:w-80 lg:h-60 lg:w-96" />
          <div className="min-w-0 flex-1 space-y-4">
            <Block className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Block className="h-3 w-20" />
                  <Block className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Whatever comes next is a card of figures, settled or not. */}
      <div className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <Block className="h-5 w-40" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Block className="h-3 w-24" />
              <Block className="h-7 w-28" />
              <Block className="h-3 w-20" />
            </div>
          ))}
        </div>
        <Block className="mt-5 h-2 w-full" />
      </div>
    </div>
  );
}
