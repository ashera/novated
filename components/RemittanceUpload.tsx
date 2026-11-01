"use client";

import { useMemo, useRef, useState } from "react";
import { fmtCurrencyCents } from "@/lib/au/format";
import {
  mergeRemittances,
  parseRemittanceCsv,
  type RemittanceRow,
} from "@/lib/au/remittance";

/**
 * The box an accounting export goes into.
 *
 * Paste or pick a file, because both are how people get a CSV out of
 * accounting software and neither is obviously the right one. Everything is
 * parsed in the browser and nothing is sent anywhere until the rows are
 * accepted, which is the same promise the statement box makes.
 *
 * It shows which columns it used before it shows the rows. That is not
 * decoration: these exports differ by report and by package, and a parser
 * that silently took "Net" where the reader meant "Gross" would produce a
 * reconciliation that is wrong in a way nothing on the page would reveal.
 * Naming the columns makes the one assumption it makes checkable in a glance.
 */

export default function RemittanceUpload({
  rows,
  onMerge,
}: {
  rows: RemittanceRow[];
  onMerge: (next: RemittanceRow[], added: number) => void;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseRemittanceCsv(text), [text]);
  const total = parsed.rows.reduce((t, r) => t + r.amount, 0);

  const accept = () => {
    const merged = mergeRemittances(rows, parsed.rows);
    onMerge(merged.rows, merged.added);
    setText("");
    setNote(
      merged.added === 0
        ? "Nothing new — every row in that export was already here."
        : `Added ${merged.added} payment${merged.added === 1 ? "" : "s"}.` +
            (merged.alreadyKnown > 0 ? ` ${merged.alreadyKnown} were already known.` : ""),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setText(await f.text());
            setNote(null);
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-panel-2"
        >
          Choose a CSV
        </button>
        <span className="text-xs text-muted">or paste it below</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        rows={5}
        spellCheck={false}
        placeholder={"Date,Account,Reference,Details,Gross,GST,Net\n05/06/2026,GST (820),GST,Provider - vehicle lease GST,149.61,0.00,149.61"}
        className="w-full rounded-lg border border-line bg-panel p-3 font-mono text-xs text-ink outline-none placeholder:text-muted/70 focus:border-accent"
      />

      {text.trim() !== "" && parsed.columns == null && (
        <p className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-xs leading-relaxed text-danger-text">
          Couldn&apos;t find a date column and an amount column in the header row. The export
          needs a header line — a date column named something like &ldquo;Date&rdquo;, and an
          amount column named &ldquo;Gross&rdquo;, &ldquo;Amount&rdquo; or &ldquo;Net&rdquo;.
        </p>
      )}

      {parsed.columns && (
        <div className="rounded-lg border border-line bg-panel-2 p-3">
          <p className="text-xs text-subtle">
            Reading <strong className="text-ink">{parsed.columns.date}</strong> as the date,{" "}
            <strong className="text-ink">{parsed.columns.amount}</strong> as the amount, and{" "}
            <strong className="text-ink">{parsed.columns.description}</strong> as the
            description. Dates are read day first.
          </p>
          <p className="mt-1.5 text-xs font-medium text-ink">
            {parsed.rows.length} payment{parsed.rows.length === 1 ? "" : "s"},{" "}
            {fmtCurrencyCents(total)} in total
            {parsed.rows.length > 0 &&
              ` · ${parsed.rows[0].date} to ${parsed.rows[parsed.rows.length - 1].date}`}
            {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} line(s) skipped`}
          </p>
          {parsed.rows.length > 0 && (
            <button
              type="button"
              onClick={accept}
              className="mt-2.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-soft"
            >
              Add these payments
            </button>
          )}
        </div>
      )}

      {note && (
        <p
          role="status"
          className="rounded-lg border border-accent-border bg-accent-subtle px-3 py-2 text-xs text-ink"
        >
          {note}
        </p>
      )}
    </div>
  );
}
