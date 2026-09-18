"use client";

import { useMemo, useState } from "react";
import { parseStatement, type StatementRow } from "@/lib/au/statement";
import { mergeRows, type LoggedRow, type MergeResult } from "@/lib/au/statementLog";
import { track } from "@/lib/analytics";

/**
 * The box you paste a statement into.
 *
 * Extracted because there are now two places that want it — the page for
 * somebody who has only a statement, and the dashboard for somebody tracking
 * a lease they have already signed — and a second copy of the parse, the
 * merge and the report would be a second copy of the only tricky part: the
 * merge is idempotent and the report has to make "nothing new" read as a
 * correct outcome rather than a failure.
 *
 * It owns the text and the merge; the caller owns the log. That split matters
 * on the dashboard, where the rows belong to the lease and have to be saved
 * through the same store as everything else on it.
 */
export default function StatementPaste({
  log,
  onMerge,
  sample,
  children,
}: {
  log: LoggedRow[];
  onMerge: (rows: LoggedRow[], result: MergeResult) => void;
  /** An example ledger, for somebody who wants to see what it does before
   *  fetching their own. Omitted where showing one would be noise. */
  sample?: string;
  /** What to say above the box. */
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [last, setLast] = useState<MergeResult | null>(null);

  const parsed = useMemo(() => parseStatement(text), [text]);

  const add = () => {
    const result = mergeRows(log, parsed.rows);
    setLast(result);
    onMerge(result.rows, result);
    setText("");
    track("Statement rows merged", {
      added: String(result.added),
      known: String(result.alreadyKnown),
    });
  };

  return (
    <div>
      {children}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={text ? 8 : 4}
        spellCheck={false}
        placeholder={"11 September 2026\tFunds from Payroll\t$1,698.98\t$2,665.26\n…"}
        className="mt-3 w-full rounded-lg border border-line bg-panel-2 p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {parsed.rows.length > 0 ? (
          <>
            <button
              type="button"
              onClick={add}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft"
            >
              Add {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} to my ledger
            </button>
            <button
              type="button"
              onClick={() => setText("")}
              className="font-semibold text-accent hover:underline"
            >
              Clear
            </button>
            {parsed.skipped.length > 0 && (
              <span className="text-muted">{parsed.skipped.length} lines ignored</span>
            )}
          </>
        ) : (
          sample && (
            <button
              type="button"
              onClick={() => {
                setText(sample);
                track("Statement sample loaded");
              }}
              className="font-semibold text-accent hover:underline"
            >
              Try it with an example statement
            </button>
          )
        )}
      </div>

      {/* What the merge did, in its own words. Pasting the same window twice is
          the normal case rather than a mistake, so "nothing new" has to read as
          a correct outcome and not a failure. */}
      {last && (
        <p className="mt-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs leading-relaxed text-subtle">
          {last.added > 0
            ? `Added ${last.added} new transaction${last.added === 1 ? "" : "s"}.`
            : "Nothing new in that one."}{" "}
          {last.alreadyKnown > 0 &&
            `${last.alreadyKnown} ${last.alreadyKnown === 1 ? "was" : "were"} already in your ledger, so ${last.alreadyKnown === 1 ? "it was" : "they were"} left alone. `}
          {last.conflicts.length > 0 && (
            <span className="text-warning-text">
              {last.conflicts.length} row{last.conflicts.length === 1 ? "" : "s"} matched something
              already stored but with a different running balance — both are kept, and the gap
              check will say whether one of them is wrong.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export type { StatementRow };
