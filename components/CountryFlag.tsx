import { countryName } from "@/lib/countryName";

/** A small country flag from a 2-letter ISO code. Uses flag IMAGES (flagcdn) rather
 *  than flag emoji, because flag emoji don't render on Windows (they degrade to the
 *  letters "AU"). No hooks → usable from server and client components alike. */
export default function CountryFlag({
  code,
  showName = false,
  showCode = true,
}: {
  code: string | null | undefined;
  showName?: boolean;
  showCode?: boolean;
}) {
  if (!code) return <span className="text-muted">—</span>;
  const cc = code.toLowerCase();
  const name = countryName(code) ?? code;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://flagcdn.com/20x15/${cc}.png`}
        srcSet={`https://flagcdn.com/40x30/${cc}.png 2x`}
        width={20}
        height={15}
        alt={name}
        loading="lazy"
        className="rounded-[2px] ring-1 ring-white/10"
      />
      {showName ? (
        <span className="text-ink">{name}</span>
      ) : showCode ? (
        <span className="text-xs uppercase text-muted">{code}</span>
      ) : null}
    </span>
  );
}
