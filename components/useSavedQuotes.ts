"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quote } from "@/lib/au/quote";
import {
  adoptLocalQuotes,
  deleteQuote as deleteRemote,
  listQuotes,
  saveQuote as saveRemote,
  updateQuote as updateRemote,
  type SavedQuote,
} from "@/app/actions/quotes";

/**
 * The saved-quote store, which has to work for two different people:
 *
 *   • a guest, who has just been sent a quote and is not going to create an
 *     account before finding out what it says — their quotes live in the browser
 *   • a signed-in user, whose quotes follow them between devices
 *
 * Signing in promotes whatever is in the browser onto the account, once, and
 * then clears local storage so there is only ever one source of truth. Local
 * storage is only cleared after the server confirms what it took, so a failed
 * adoption loses nothing.
 */

const KEY = "leasewiz-quotes";

export interface LocalQuote {
  id: string;
  label: string;
  data: Quote;
  updated_at: string;
}

function readLocal(): LocalQuote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q) => q?.data) : [];
  } catch {
    return [];
  }
}

function writeLocal(quotes: LocalQuote[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(quotes));
  } catch {
    /* storage blocked — the session still works, it just won't persist */
  }
}

export function useSavedQuotes(signedIn: boolean) {
  const [quotes, setQuotes] = useState<(SavedQuote | LocalQuote)[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopted, setAdopted] = useState(0);

  const refresh = useCallback(async () => {
    if (signedIn) {
      setQuotes(await listQuotes());
    } else {
      setQuotes(readLocal());
    }
    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    let live = true;

    (async () => {
      if (!signedIn) {
        if (live) {
          setQuotes(readLocal());
          setLoading(false);
        }
        return;
      }
      // Signed in: hand over anything the browser is still holding, then load.
      const local = readLocal();
      if (local.length > 0) {
        const res = await adoptLocalQuotes(
          local.map((q) => ({ label: q.label, data: q.data })),
        );
        if (res.adopted > 0) {
          // Only now is it safe to forget them.
          writeLocal([]);
          if (live) setAdopted(res.adopted);
        }
      }
      const remote = await listQuotes();
      if (live) {
        setQuotes(remote);
        setLoading(false);
      }
    })().catch(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [signedIn]);

  const add = useCallback(
    async (label: string, data: Quote): Promise<{ error?: string }> => {
      if (signedIn) {
        const res = await saveRemote(label, data);
        if (res.error) return { error: res.error };
        await refresh();
        return {};
      }
      const next = [
        {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: label.trim() || "Untitled quote",
          data,
          updated_at: new Date().toISOString(),
        },
        ...readLocal(),
      ].slice(0, 25);
      writeLocal(next);
      setQuotes(next);
      return {};
    },
    [signedIn, refresh],
  );

  const update = useCallback(
    async (id: string, label: string, data: Quote): Promise<{ error?: string }> => {
      if (signedIn && !id.startsWith("local-")) {
        const res = await updateRemote(id, label, data);
        if (res.error) return { error: res.error };
        await refresh();
        return {};
      }
      const next = readLocal().map((q) =>
        q.id === id ? { ...q, label, data, updated_at: new Date().toISOString() } : q,
      );
      writeLocal(next);
      setQuotes(next);
      return {};
    },
    [signedIn, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (signedIn && !id.startsWith("local-")) {
        await deleteRemote(id);
        await refresh();
        return;
      }
      const next = readLocal().filter((q) => q.id !== id);
      writeLocal(next);
      setQuotes(next);
    },
    [signedIn, refresh],
  );

  return { quotes, loading, add, update, remove, refresh, adopted };
}
