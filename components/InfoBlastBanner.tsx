"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getActiveInfoBlasts, type InfoBlast } from "@/app/actions/infoblasts";

// Optional call-to-action button for a blast. Internal paths use next/link; external
// URLs open in a new tab.
function BlastLink({ url, label }: { url: string; label: string }) {
  const text = label.trim() || "Learn more";
  const cls =
    "inline-flex w-fit items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white transition hover:brightness-110";
  return url.startsWith("/") ? (
    <Link href={url} className={cls}>
      {text} <span aria-hidden>→</span>
    </Link>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      {text} <span aria-hidden>→</span>
    </a>
  );
}

const ROTATE_MS = 30_000;

// A rotating announcement banner ("InfoBlast") at the foot of the hero's right column.
// Content is managed in the backoffice (/admin/infoblasts): each blast has an
// attention-grabbing icon, a title and a paragraph of subtext, and can be
// enabled/disabled. Enabled blasts rotate every 30 seconds. Renders nothing when there
// are no active blasts.
export default function InfoBlastBanner() {
  const [blasts, setBlasts] = useState<InfoBlast[]>([]);
  const [idx, setIdx] = useState(0);
  const [entering, setEntering] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let live = true;
    getActiveInfoBlasts()
      .then((b) => live && setBlasts(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (blasts.length < 2) return;
    timer.current = setInterval(() => {
      setEntering(false); // fade out
      setTimeout(() => {
        setIdx((i) => (i + 1) % blasts.length);
        setEntering(true); // fade in the next
      }, 250);
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [blasts.length]);

  if (blasts.length === 0) return null;
  const b = blasts[idx % blasts.length];

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/[0.08] px-3.5 py-3 ring-1 ring-inset ring-accent/10"
      role="status"
      aria-live="polite"
    >
      <div className={`transition-opacity duration-300 ${entering ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="text-xl leading-none">{b.icon || "✨"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-snug text-ink">{b.title}</div>
            {b.subtext && <p className="mt-0.5 text-[11.5px] leading-snug text-ink">{b.subtext}</p>}
          </div>
        </div>
        {b.link_url && (
          <div className="mt-2 pl-[30px]">
            <BlastLink url={b.link_url} label={b.link_label} />
          </div>
        )}
      </div>
      {blasts.length > 1 && (
        <div className="flex items-center gap-1.5 pl-[30px]" aria-hidden>
          {blasts.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition ${i === idx % blasts.length ? "bg-accent" : "bg-accent/25"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
