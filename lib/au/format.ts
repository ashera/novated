const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function fmtCurrency(n: number): string {
  return isFinite(n) ? currency.format(n) : "—";
}

export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function fmtPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "Never";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
