"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  findProviderByName,
  suggestProviders,
  validateProviderName,
  type Provider,
} from "@/lib/au/providers";
import { suggestProvider } from "@/app/actions/providers";

/**
 * "Who quoted it", with the directory behind it.
 *
 * A combobox rather than a select, because the list will never be complete:
 * there are a lot of novated leasing companies and new ones appear. So it
 * stays a text box that accepts anything, and the suggestions are help rather
 * than a gate — whatever is typed is the quote's label either way, even if
 * the directory never hears about it.
 *
 * Adding one is offered only when what has been typed matches nothing we
 * know, compared on the slug so "Maxxia Pty Ltd" is recognised as Maxxia
 * instead of being offered as new.
 */

export default function ProviderPicker({
  value,
  onChange,
  providers,
  readOnly = false,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  providers: Provider[];
  readOnly?: boolean;
  /** Show it as the requirement it is. Quotes are identified by this name
   *  everywhere they are listed or compared, and it used to arrive pre-filled
   *  with "Quote 2" — which looked answered, so it stayed that way. */
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // -1 = nothing highlighted. Deliberate: with the first row pre-selected,
  // one ArrowDown landed on "add as a new provider" and Enter created a
  // provider out of a half-typed word — "smartl" went into the moderation
  // queue during testing. Nothing is chosen until the user actually chooses
  // it, and a bare Enter just accepts what they typed.
  const [active, setActive] = useState(-1);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Anything added this session, so it stops being offered as new and shows
  // in the list even though it is pending and nobody else can see it.
  const [mine, setMine] = useState<Provider[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const all = [...providers, ...mine];
  const matches = suggestProviders(all, value);
  const known = findProviderByName(all, value);
  const canAdd = !known && validateProviderName(value).ok;
  const rows = canAdd ? matches.length + 1 : matches.length;

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (p: Provider) => {
    onChange(p.name);
    setOpen(false);
    setError(null);
  };

  const add = async () => {
    const checked = validateProviderName(value);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await suggestProvider(checked.name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.provider) {
      setMine((m) => [...m, res.provider!]);
      onChange(res.provider.name);
      // Only say "we'll check it" for something genuinely new. A name that
      // was already known just gets used.
      setAdded(res.provider.status === "pending" ? res.provider.name : null);
    }
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      setActive(e.key === "ArrowDown" ? 0 : rows - 1);
      return;
    }
    if (!open || rows === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rows - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Nothing highlighted: they are done typing, not picking.
      if (active < 0) {
        setOpen(false);
        return;
      }
      e.preventDefault();
      if (canAdd && active === matches.length) void add();
      else if (matches[active]) choose(matches[active]);
    }
  };

  const missing = required && !readOnly && value.trim() === "";

  return (
    <div className="relative" ref={box}>
      <label className="block">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">Who quoted it</span>
          {required && !readOnly && (
            <span
              className={`text-[11px] font-medium ${missing ? "text-danger-text" : "text-muted"}`}
            >
              Required
            </span>
          )}
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={readOnly ? "" : "Start typing the provider's name"}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
            setAdded(null);
            setError(null);
          }}
          onFocus={() => !readOnly && setOpen(true)}
          onKeyDown={readOnly ? undefined : onKey}
          aria-required={required || undefined}
          aria-invalid={missing || undefined}
          className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-ink outline-none ${
            missing ? "border-danger/50" : "border-line"
          } ${readOnly ? "bg-panel-3" : "bg-panel-2 focus:border-accent"}`}
        />
      </label>

      {!readOnly && open && rows > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-panel py-1 shadow-[var(--shadow-card)]"
        >
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-accent-subtle text-accent" : "text-ink"
                }`}
              >
                {m.name}
                {m.status === "pending" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Awaiting check
                  </span>
                )}
              </button>
            </li>
          ))}

          {canAdd && (
            <li role="option" aria-selected={active === matches.length}>
              <button
                type="button"
                onMouseEnter={() => setActive(matches.length)}
                onClick={() => void add()}
                disabled={busy}
                className={`w-full border-t border-line px-3 py-1.5 text-left text-sm ${
                  active === matches.length ? "bg-accent-subtle text-accent" : "text-subtle"
                }`}
              >
                {busy ? "Adding…" : <>Add &ldquo;{value.trim()}&rdquo; as a new provider</>}
              </button>
            </li>
          )}
        </ul>
      )}

      {missing && !error && (
        <p className="mt-1 text-[11px] leading-snug text-danger-text">
          Name the provider who sent it. Quotes are listed and compared by this, and one
          can&apos;t be locked in without it.
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-danger-text">{error}</p>}
      {added && !error && (
        <p className="mt-1 text-[11px] text-muted">
          Thanks — we&apos;ll check {added} and add it to the list. Your quote is unaffected.
        </p>
      )}
    </div>
  );
}
