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
 * request per character. That debounce is a window in which the work exists
 * only in memory, so every change is also mirrored to local storage the moment
 * it happens, and reconciled on the next load. It costs nothing, it survives a
 * crash, a closed tab and a dropped connection, and it is the only copy that
 * outlives an unload — a browser will not reliably finish a server action once
 * the page is going away.
 */

const KEY = "leasewiz-leases";
const ACTIVE_KEY = "leasewiz-active-lease";
const PENDING_KEY = "leasewiz-unsaved";
const SAVE_DEBOUNCE_MS = 1_200;

interface LocalRecord {
  id: string;
  lease: Lease;
  updated_at: string;
}

/** The newest edit, written before it has been saved anywhere. `id` is null
 *  when the lease has never been stored. `seq` counts edits within a session,
 *  so a save can tell whether it is the last word or has been overtaken. */
interface PendingRecord {
  id: string | null;
  lease: Lease;
  at: string;
  seq: number;
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

function readPending(): PendingRecord | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as PendingRecord) : null;
    return p?.lease && p.at ? p : null;
  } catch {
    return null;
  }
}

function writePending(record: PendingRecord) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(record));
  } catch {
    /* storage blocked — the debounced save is then the only copy */
  }
}

/** Only clears the mirror if it still holds the edit that was just saved.
 *  A save that resolves after the user has typed again must not throw away
 *  the newer work it knows nothing about. */
function clearPending(seq: number) {
  try {
    if ((readPending()?.seq ?? -1) === seq) localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fold the crash mirror back into the records it belongs to.
 *
 * Compares content rather than timestamps on purpose. The mirror is written by
 * one device's clock and the stored copy is stamped by another (or by the
 * database), so a machine running a few minutes slow would decide its own
 * unsaved work was the older of the two and quietly bin it. Existence is the
 * real signal: the mirror is deleted the moment a save is confirmed, so a
 * mirror that is still here and differs from what was stored is, by
 * definition, work that never landed.
 */
function absorbPending(
  records: LocalRecord[],
  pending: PendingRecord | null,
): { records: LocalRecord[]; restoredId: string | null } {
  if (!pending) return { records, restoredId: null };
  const idx = pending.id ? records.findIndex((r) => r.id === pending.id) : -1;
  if (idx >= 0) {
    if (JSON.stringify(records[idx].lease) === JSON.stringify(pending.lease)) {
      return { records, restoredId: null };
    }
    const next = records.slice();
    next[idx] = { id: records[idx].id, lease: pending.lease, updated_at: pending.at };
    return { records: next, restoredId: next[idx].id };
  }
  const id = pending.id ?? localId();
  return {
    records: [{ id, lease: pending.lease, updated_at: pending.at }, ...records],
    restoredId: id,
  };
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
  // Counts edits so a save that resolves late can tell whether it is still the
  // newest thing the user has done.
  const editSeq = useRef(0);
  // The flush-on-unmount effect must not depend on these, or its cleanup runs
  // on every render and writes whatever the PREVIOUS render was holding. A ref
  // gives it the current values without making it re-subscribe.
  const latest = useRef({
    lease,
    leaseId,
    persistFn: null as null | ((l: Lease, id: string | null, seq?: number) => Promise<void>),
  });

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;

    (async () => {
      if (!signedIn) {
        const { records, restoredId } = absorbPending(readLocal(), readPending());
        if (restoredId) {
          writeLocal(records.slice(0, 20));
          try {
            localStorage.removeItem(PENDING_KEY);
          } catch {
            /* ignore */
          }
        }
        if (!live) return;
        const activeId =
          restoredId ??
          (() => {
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
      //
      // A mirror against a browser-only lease is handed over with the rest; a
      // mirror against a lease that already lives on the account is pushed
      // back up once we can see what the server has.
      const pending = readPending();
      const serverSide = pending?.id != null && !pending.id.startsWith("local-");
      const { records: local } = absorbPending(readLocal(), serverSide ? null : pending);
      if (local.length > 0) {
        const res = await adoptLocalLeases(local.map((r) => r.lease));
        if (res.adopted > 0) {
          writeLocal([]);
          if (live) setAdopted(res.adopted);
        }
      }
      if (!serverSide) {
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          /* ignore */
        }
      }

      let [active, list] = await Promise.all([getActiveLease(), listLeases()]);

      if (serverSide && pending) {
        const stored = list.find((l: SavedLease) => l.id === pending.id);
        if (stored && JSON.stringify(stored.lease) !== JSON.stringify(pending.lease)) {
          const res = await saveRemote(pending.id, pending.lease);
          if (res.ok) {
            clearPending(pending.seq);
            if (active?.id === pending.id) active = { ...active, lease: pending.lease };
            list = await listLeases();
          }
        } else if (stored) {
          clearPending(pending.seq);
        }
      }

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
    async (next: Lease, id: string | null, seq = editSeq.current) => {
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
        clearPending(seq);
        return;
      }
      setSaving(true);
      const res = await saveRemote(id, next);
      setSaving(false);
      if (res.id && res.id !== id) setLeaseId(res.id);
      if (res.ok) {
        clearPending(seq);
        setAll(await listLeases().then((l) => l.map((x) => ({ id: x.id, name: x.name }))));
      }
    },
    [signedIn],
  );

  const update = useCallback(
    (fn: (l: Lease) => Lease) => {
      const seq = ++editSeq.current;
      setLease((current) => {
        const next = fn(current);
        dirty.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          dirty.current = false;
          void persist(next, leaseId, seq);
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [persist, leaseId],
  );

  latest.current = { lease, leaseId, persistFn: persist };

  // The crash mirror. Written after the render that showed the change, so it
  // is on disk within a frame of the user seeing their own edit — long before
  // the debounced save runs, and whether or not that save ever gets to.
  useEffect(() => {
    if (!dirty.current) return;
    writePending({ id: leaseId, lease, at: new Date().toISOString(), seq: editSeq.current });
  }, [lease, leaseId]);

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
      void persistFn?.(l, id, editSeq.current);
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
