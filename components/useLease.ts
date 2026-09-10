"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { migrateLease, newLease, type Lease } from "@/lib/au/lease";
import {
  adoptLocalLeases,
  deleteLease as deleteRemote,
  getActiveLease,
  listLeases,
  saveLease as saveRemote,
  setActiveLease as setActiveRemote,
  type SavedLease,
} from "@/app/actions/leases";

/**
 * The one lease both tools are working on.
 *
 * This is the whole point of the lease entity: the calculator and the decoder
 * share it, so a car described in one appears in the other. Everything either
 * page changes goes through `update`, which is why they stay in step.
 *
 * Two audiences, as everywhere else here. A guest keeps leases in the browser,
 * because nobody creates an account before finding out what their quote says.
 * Signing in promotes them onto the account once, and local storage is only
 * cleared after the server confirms what it took.
 *
 * Signed-in edits are debounced rather than written on every keystroke — the
 * inputs are sliders and number fields, and a save per character would be a
 * request per character.
 */

const KEY = "leasewiz-leases";
const ACTIVE_KEY = "leasewiz-active-lease";
const SAVE_DEBOUNCE_MS = 1_200;

interface LocalRecord {
  id: string;
  lease: Lease;
  updated_at: string;
}

function readLocal(): LocalRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r?.lease) : [];
  } catch {
    return [];
  }
}

function writeLocal(records: LocalRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage blocked — the session still works, it just won't persist */
  }
}

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface UseLease {
  lease: Lease;
  leaseId: string | null;
  all: { id: string; name: string }[];
  loading: boolean;
  adopted: number;
  saving: boolean;
  /** Change the lease. Persists on its own — no explicit save needed. */
  update: (fn: (l: Lease) => Lease) => void;
  switchTo: (id: string) => void;
  create: () => void;
  remove: (id: string) => void;
}

export function useLease(signedIn: boolean): UseLease {
  const [lease, setLease] = useState<Lease>(newLease);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [all, setAll] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopted, setAdopted] = useState(0);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  // The flush-on-unmount effect must not depend on these, or its cleanup runs
  // on every render and writes whatever the PREVIOUS render was holding. A ref
  // gives it the current values without making it re-subscribe.
  const latest = useRef({ lease, leaseId, persistFn: null as null | ((l: Lease, id: string | null) => Promise<void>) });

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;

    (async () => {
      if (!signedIn) {
        const records = readLocal();
        if (!live) return;
        const activeId = (() => {
          try {
            return localStorage.getItem(ACTIVE_KEY);
          } catch {
            return null;
          }
        })();
        const found = records.find((r) => r.id === activeId) ?? records[0];
        if (found) {
          setLease(migrateLease(found.lease));
          setLeaseId(found.id);
        }
        setAll(records.map((r) => ({ id: r.id, name: r.lease.name })));
        setLoading(false);
        return;
      }

      // Signed in: hand over anything the browser still holds, then load.
      const local = readLocal();
      if (local.length > 0) {
        const res = await adoptLocalLeases(local.map((r) => r.lease));
        if (res.adopted > 0) {
          writeLocal([]);
          if (live) setAdopted(res.adopted);
        }
      }
      const [active, list] = await Promise.all([getActiveLease(), listLeases()]);
      if (!live) return;
      if (active) {
        setLease(active.lease);
        setLeaseId(active.id);
      }
      setAll(list.map((l: SavedLease) => ({ id: l.id, name: l.name })));
      setLoading(false);
    })().catch(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [signedIn]);

  // ── Persist ─────────────────────────────────────────────────────────────
  const persist = useCallback(
    async (next: Lease, id: string | null) => {
      if (!signedIn) {
        const records = readLocal();
        const recordId = id ?? localId();
        const at = new Date().toISOString();
        const idx = records.findIndex((r) => r.id === recordId);
        const record = { id: recordId, lease: next, updated_at: at };
        if (idx >= 0) records[idx] = record;
        else records.unshift(record);
        writeLocal(records.slice(0, 20));
        try {
          localStorage.setItem(ACTIVE_KEY, recordId);
        } catch {
          /* ignore */
        }
        setLeaseId(recordId);
        setAll(records.map((r) => ({ id: r.id, name: r.lease.name })));
        return;
      }
      setSaving(true);
      const res = await saveRemote(id, next);
      setSaving(false);
      if (res.id && res.id !== id) setLeaseId(res.id);
      if (res.ok) setAll(await listLeases().then((l) => l.map((x) => ({ id: x.id, name: x.name }))));
    },
    [signedIn],
  );

  const update = useCallback(
    (fn: (l: Lease) => Lease) => {
      setLease((current) => {
        const next = fn(current);
        dirty.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          dirty.current = false;
          void persist(next, leaseId);
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [persist, leaseId],
  );

  latest.current = { lease, leaseId, persistFn: persist };

  // Don't lose the last edit to a navigation inside the debounce window.
  //
  // Deliberately mounted once. An earlier version listed lease/leaseId as
  // dependencies, so React tore the effect down and set it up again on every
  // render — and the teardown flushed the render BEFORE the one that had just
  // happened, while cancelling the correct pending save. Every edit persisted
  // the state from one edit ago.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      const { lease: l, leaseId: id, persistFn } = latest.current;
      void persistFn?.(l, id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const switchTo = useCallback(
    (id: string) => {
      if (id === leaseId) return;
      if (!signedIn) {
        const found = readLocal().find((r) => r.id === id);
        if (!found) return;
        setLease(migrateLease(found.lease));
        setLeaseId(id);
        try {
          localStorage.setItem(ACTIVE_KEY, id);
        } catch {
          /* ignore */
        }
        return;
      }
      void (async () => {
        await setActiveRemote(id);
        const active = await getActiveLease();
        if (active) {
          setLease(active.lease);
          setLeaseId(active.id);
        }
      })();
    },
    [leaseId, signedIn],
  );

  const create = useCallback(() => {
    const fresh = newLease(`Lease ${all.length + 1}`);
    setLease(fresh);
    setLeaseId(null);
    void persist(fresh, null);
  }, [all.length, persist]);

  const remove = useCallback(
    (id: string) => {
      void (async () => {
        if (signedIn) await deleteRemote(id);
        else {
          const rest = readLocal().filter((r) => r.id !== id);
          writeLocal(rest);
        }
        const rest = signedIn
          ? await listLeases().then((l) => l.map((x) => ({ id: x.id, name: x.name })))
          : readLocal().map((r) => ({ id: r.id, name: r.lease.name }));
        setAll(rest);
        if (id === leaseId) {
          const next = rest[0];
          if (next) switchTo(next.id);
          else {
            setLease(newLease());
            setLeaseId(null);
          }
        }
      })();
    },
    [signedIn, leaseId, switchTo],
  );

  return { lease, leaseId, all, loading, adopted, saving, update, switchTo, create, remove };
}
