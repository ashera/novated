"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRelease, deleteRelease, type ReleaseInput } from "@/app/actions/releases";
import type { Release } from "@/lib/releases";

interface Defaults {
  version: string;
  build: number;
  commit: string;
  date: string; // today, YYYY-MM-DD
}

interface FormState {
  id?: string;
  version: string;
  build: string;
  commit_hash: string;
  released_at: string;
  title: string;
  notesText: string; // one bullet per line
  published: boolean;
}

const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export default function ReleasesAdmin({ releases, defaults }: { releases: Release[]; defaults: Defaults }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const blank = (): FormState => ({
    version: defaults.version,
    build: String(defaults.build),
    commit_hash: defaults.commit,
    released_at: defaults.date,
    title: "",
    notesText: "",
    published: true,
  });
  const [form, setForm] = useState<FormState>(blank());
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!form.id;

  const loadForEdit = (r: Release) => {
    setMsg(null);
    setForm({
      id: r.id,
      version: r.version,
      build: r.build != null ? String(r.build) : "",
      commit_hash: r.commit_hash ?? "",
      released_at: r.released_at,
      title: r.title ?? "",
      notesText: r.notes.join("\n"),
      published: r.published,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setMsg(null);
    if (!form.version.trim()) {
      setMsg("Version is required.");
      return;
    }
    const payload: ReleaseInput = {
      id: form.id,
      version: form.version.trim(),
      build: form.build.trim() === "" ? null : Number(form.build),
      commit_hash: form.commit_hash.trim() || null,
      released_at: form.released_at,
      title: form.title.trim() || null,
      notes: form.notesText.split("\n"),
      published: form.published,
    };
    start(async () => {
      const res = await saveRelease(payload);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg(editing ? "Saved." : "Release added.");
      setForm(blank());
      router.refresh();
    });
  };

  const remove = (r: Release) => {
    if (!window.confirm(`Delete release v${r.version}? This can't be undone.`)) return;
    start(async () => {
      await deleteRelease(r.id);
      if (form.id === r.id) setForm(blank());
      router.refresh();
    });
  };

  return (
    <div>
      {/* Editor */}
      <div className="mb-8 rounded-2xl border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{editing ? "Edit release" : "Add a release"}</h2>
          {editing && (
            <button onClick={() => setForm(blank())} className="text-xs text-muted hover:text-ink">
              + New instead
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <span className={label}>Version</span>
            <input className={input} value={form.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0.452" />
          </div>
          <div className="sm:col-span-1">
            <span className={label}>Build</span>
            <input className={input} value={form.build} onChange={(e) => set("build", e.target.value)} placeholder="452" inputMode="numeric" />
          </div>
          <div className="sm:col-span-1">
            <span className={label}>Commit</span>
            <input className={input} value={form.commit_hash} onChange={(e) => set("commit_hash", e.target.value)} placeholder="c05e22c" />
          </div>
          <div className="sm:col-span-1">
            <span className={label}>Released</span>
            <input type="date" className={input} value={form.released_at} onChange={(e) => set("released_at", e.target.value)} />
          </div>
        </div>

        <div className="mt-3">
          <span className={label}>Title (optional)</span>
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Debt recycling + faster scenario switching" />
        </div>

        <div className="mt-3">
          <span className={label}>What changed — one bullet per line (plain, non-tech language)</span>
          <textarea
            className={`${input} min-h-[8rem] font-normal`}
            value={form.notesText}
            onChange={(e) => set("notesText", e.target.value)}
            placeholder={"You can now compare a “debt recycling” strategy against extra super\nSwitching between saved plans shows a loading spinner\nFixed the retirement income figures shown for couples who retire at different ages"}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="h-4 w-4 accent-emerald-500" />
            Published (visible on the public /releases page)
          </label>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs text-accent">{msg}</span>}
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add release"}
            </button>
          </div>
        </div>
      </div>

      {/* Existing releases */}
      <div className="space-y-3">
        {releases.length === 0 && <p className="text-sm text-muted">No releases yet — add the first one above.</p>}
        {releases.map((r) => (
          <div key={r.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-ink">{r.released_at}</span>
                {r.title && <span className="text-sm text-ink">— {r.title}</span>}
                {!r.published && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-warning-text">Draft</span>}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="tabular-nums">v{r.version}{r.build != null ? ` · ${r.build}` : ""}{r.commit_hash ? ` · ${r.commit_hash.slice(0, 7)}` : ""}</span>
                <button onClick={() => loadForEdit(r)} className="text-accent hover:underline">Edit</button>
                <button onClick={() => remove(r)} disabled={pending} className="text-muted hover:text-danger-text disabled:opacity-50">Delete</button>
              </div>
            </div>
            {r.notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-[13px] text-ink">
                {r.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
