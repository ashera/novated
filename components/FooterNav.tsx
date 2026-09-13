import Link from "next/link";

// Sitewide footer navigation. The per-user surfaces (report, account, admin)
// live in the top bar's account menu.
//
// The decoder is listed here as well as in the top bar. It was previously in
// neither, reachable only from a card on the calculator — which meant the
// feature that most distinguishes this site depended on one link on one page.
const LINKS = [
  { href: "/", label: "Your leases" },
  { href: "/decode", label: "Decode a quote" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/glossary", label: "Glossary" },
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
