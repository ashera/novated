"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInfoBlast, deleteInfoBlast, setInfoBlastEnabled, type InfoBlast } from "@/app/actions/infoblasts";

interface FormState {
  id?: string;
  icon: string;
  title: string;
  subtext: string;
  link_url: string;
  link_label: string;
  enabled: boolean;
  sort_order: string;
}

const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export default function InfoBlastsAdmin({ blasts }: { blasts: InfoBlast[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const blank = (): FormState => ({ icon: "✨", title: "", subtext: "", link_url: "", link_label: "", enabled: true, sort_order: String(blasts.length) });
  const [form, setForm] = useState<FormState>(blank());
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!form.id;

  const loadForEdit = (b: InfoBlast) => {
    setMsg(null);
    setForm({ id: b.id, icon: b.icon, title: b.title, subtext: b.subtext, link_url: b.link_url ?? "", link_label: b.link_label ?? "", enabled: b.enabled, sort_order: String(b.sort_order) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setMsg(null);
    if (!form.title.trim()) {
      setMsg("Title is required.");
      return;
    }
    start(async () => {
      const res = await saveInfoBlast({
        id: form.id,
        icon: form.icon.trim(),
        title: form.title.trim(),
        subtext: form.subtext.trim(),
        link_url: form.link_url.trim(),
        link_label: form.link_label.trim(),
        enabled: form.enabled,
        sort_order: form.sort_order.trim() === "" ? 0 : Number(form.sort_order),
      });
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg(editing ? "Saved." : "InfoBlast added.");
      setForm(blank());
      router.refresh();
    });
  };

  const toggle = (b: InfoBlast) => {
    start(async () => {
      await setInfoBlastEnabled(b.id, !b.enabled);
      router.refresh();
    });
  };

  const remove = (b: InfoBlast) => {
    if (!window.confirm(`Delete “${b.title}”? This can't be undone.`)) return;
    start(async () => {
      await deleteInfoBlast(b.id);
      if (form.id === b.id) setForm(blank());
      router.refresh();
    });
  };

  return (
    <div>
      {/* Editor */}
      <div className="mb-8 rounded-2xl border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{editing ? "Edit InfoBlast" : "Add an InfoBlast"}</h2>
          {editing && (
            <button onClick={() => setForm(blank())} className="text-xs text-muted hover:text-ink">
              + New instead
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-1">
            <span className={label}>Icon</span>
            <input className={`${input} text-center text-lg`} value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="✨" maxLength={4} />
          </div>
          <div className="sm:col-span-4">
            <span className={label}>Title</span>
            <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="New feature available — Estate tax view" />
          </div>
          <div className="sm:col-span-1">
            <span className={label}>Order</span>
            <input className={input} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} inputMode="numeric" placeholder="0" />
          </div>
        </div>

        <div className="mt-3">
          <span className={label}>Subtext (a short paragraph)</span>
          <textarea
            className={`${input} min-h-[5rem] font-normal`}
            value={form.subtext}
            onChange={(e) => set("subtext", e.target.value)}
            placeholder="See what your beneficiaries would pay in super death-benefit tax — now on your dashboard, below the tax chart."
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <span className={label}>Link URL (optional)</span>
            <input className={input} value={form.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="/learn/aged-care-calculator or https://…" />
          </div>
          <div>
            <span className={label}>Button label</span>
            <input className={input} value={form.link_label} onChange={(e) => set("link_label", e.target.value)} placeholder="Learn more" />
          </div>
        </div>

        {/* Live preview — matches the hero banner */}
        <div className="mt-4">
          <span className={label}>Preview</span>
          <div className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/[0.08] px-3.5 py-3 ring-1 ring-inset ring-accent/10">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="text-xl leading-none">{form.icon || "✨"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-snug text-ink">{form.title || "Your title here"}</div>
                {form.subtext && <p className="mt-0.5 text-[11.5px] leading-snug text-ink">{form.subtext}</p>}
              </div>
            </div>
            {form.link_url.trim() && (
              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
                {form.link_label.trim() || "Learn more"} <span aria-hidden>→</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-emerald-500" />
            Enabled (rotates in the dashboard banner)
          </label>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs text-accent">{msg}</span>}
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-50"
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add InfoBlast"}
            </button>
          </div>
        </div>
      </div>

      {/* Existing blasts */}
      <div className="space-y-3">
        {blasts.length === 0 && <p className="text-sm text-muted">No InfoBlasts yet — add the first one above.</p>}
        {blasts.map((b) => (
          <div key={b.id} className={`rounded-xl border p-4 ${b.enabled ? "border-line bg-panel" : "border-line/60 bg-panel/50 opacity-70"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden className="text-2xl leading-none">{b.icon || "✨"}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{b.title}</div>
                  {b.subtext && <p className="mt-0.5 text-[13px] leading-snug text-ink">{b.subtext}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[11px]">
                <span className="tabular-nums text-muted">#{b.sort_order}</span>
                <button
                  onClick={() => toggle(b)}
                  disabled={pending}
                  className={`rounded-full px-2 py-0.5 font-semibold ${b.enabled ? "bg-success-subtle text-success-text" : "bg-panel-2 text-muted"}`}
                >
                  {b.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => loadForEdit(b)} className="text-accent hover:underline">Edit</button>
                <button onClick={() => remove(b)} disabled={pending} className="text-muted hover:text-danger-text disabled:opacity-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
