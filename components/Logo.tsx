import { SITE_NAME } from "@/lib/site";

/**
 * Brand lockup — an inline SVG mark plus the wordmark, so it stays crisp at any
 * size, inherits the theme colours and costs no network request. The mark is a
 * stylised car silhouette inside a rounded square, in the ADS brand blue.
 */
export default function Logo({
  className = "",
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`inline-flex select-none items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        role="img"
        aria-label={`${SITE_NAME} logo`}
        className="h-8 w-8 shrink-0"
      >
        <rect width="32" height="32" rx="8" className="fill-accent" />
        {/* car body */}
        <path
          d="M6.5 19.5v-2.1c0-.5.2-1 .6-1.3l1.5-1.2 1.6-3.4c.3-.6.9-1 1.6-1h8.4c.7 0 1.3.4 1.6 1l1.6 3.4 1.5 1.2c.4.3.6.8.6 1.3v2.1c0 .6-.4 1-1 1h-1.2"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7.7 20.5H6.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10.6" cy="20.4" r="2.1" fill="none" stroke="white" strokeWidth="1.8" />
        <circle cx="21.4" cy="20.4" r="2.1" fill="none" stroke="white" strokeWidth="1.8" />
        <path d="M13 20.4h6" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight text-ink">{SITE_NAME}</span>
      )}
    </span>
  );
}
