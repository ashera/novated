import Link from "next/link";

// Sitewide footer navigation. Every link here is public and indexable — the
// per-user surfaces (report, account, admin) live in the top bar's account
// menu, and the decoder is reached from the calculator rather than listed as
// a destination of its own.
const LINKS = [
  { href: "/", label: "Your leases" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About & sources" },
  { href: "/releases", label: "What's new" },
];

export default function FooterNav() {
  return (
    <nav className="mx-auto mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-subtle">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-ink">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
