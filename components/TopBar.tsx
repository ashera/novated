"use client";

import Link from "next/link";
import { useState } from "react";
import Logo from "./Logo";
import CountryFlag from "./CountryFlag";
import { logout } from "@/app/actions/auth";

export interface TopBarUser {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

// The decoder used to be absent from here on the grounds that it is opened
// from the calculator, which was the site's one entry point. That stopped
// being true: the content pages are the ones search engines land people on,
// and somebody arriving on the FAQ with a provider's quote in their hand had
// no route to the tool that reads it. One door on one page is a single point
// of failure for the feature nobody else has.
const NAV = [
  { href: "/", label: "Your leases" },
  { href: "/decode", label: "Decode a quote" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

/**
 * The product's top navigation, modelled on the Atlassian app shell: a fixed
 * white bar with the brand at the left, primary navigation beside it, and the
 * account affordance pinned right.
 */
export default function TopBar({
  user,
  country,
  reviewDue = 0,
}: {
  user: TopBarUser | null;
  country?: string | null;
  reviewDue?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-3 py-1.5 text-sm font-medium text-subtle transition hover:bg-panel-2 hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {country && (
            <span className="hidden sm:inline-flex">
              <CountryFlag code={country} showCode={false} />
            </span>
          )}

          {user?.isAdmin && (
            <Link
              href="/admin"
              className="hidden items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-subtle transition hover:bg-panel-2 hover:text-ink sm:inline-flex"
            >
              Admin
              {reviewDue > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-xs font-semibold text-white">
                  {reviewDue}
                </span>
              )}
            </Link>
          )}

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[12rem] truncate sm:inline">
                  {user.name ?? user.email}
                </span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-[var(--shadow-overlay)]"
                >
                  <Link href="/account" className="block px-4 py-2 text-sm text-ink hover:bg-panel-2">
                    Your account
                  </Link>
                  <Link href="/report" className="block px-4 py-2 text-sm text-ink hover:bg-panel-2">
                    Your lease report
                  </Link>
                  {user.isAdmin && (
                    <Link href="/admin" className="block px-4 py-2 text-sm text-ink hover:bg-panel-2">
                      Admin backoffice
                    </Link>
                  )}
                  <form action={logout}>
                    <button
                      type="submit"
                      className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-panel-2"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded px-3 py-1.5 text-sm font-medium text-subtle transition hover:bg-panel-2 hover:text-ink"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
