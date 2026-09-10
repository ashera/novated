import type { Metadata, Viewport } from "next";
import "./globals.css";
import Analytics from "@/components/Analytics";
import VersionWatcher from "@/components/VersionWatcher";
import FeedbackButton from "@/components/FeedbackButton";
import FooterNav from "@/components/FooterNav";
import Link from "next/link";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import { APP_VERSION, GIT_SHA, BUILD_DATE } from "@/lib/version";

const title = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "novated lease calculator",
    "novated lease Australia",
    "salary packaging a car",
    "novated lease vs car loan",
    "electric vehicle FBT exemption",
    "employee contribution method",
    "novated lease residual",
    "salary sacrifice car",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title,
    description: SITE_DESCRIPTION,
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image", title, description: SITE_DESCRIPTION },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {},
  },
};

export const viewport: Viewport = {
  themeColor: "#0c66e4",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line bg-surface px-5 py-6 text-center text-xs text-muted print:hidden">
          <FooterNav />
          <p className="mx-auto max-w-3xl">
            <strong className="text-subtle">{SITE_NAME}</strong> explains how novated leasing works
            under Australian tax law and models the figures you enter. It provides{" "}
            <strong className="text-subtle">general information only</strong> and is not personal
            financial or tax advice — it does not consider your objectives, financial situation or
            needs, and it recommends no lease, financier or vehicle. All results are estimates in
            today&apos;s dollars using current published rates; a real quote will differ, and your
            employer must agree to the arrangement. Consider advice from a registered tax agent or
            an AFS licensee before committing.
          </p>
          <p className="mx-auto mt-3 flex items-center justify-center gap-2 text-[11px] text-muted">
            <Link href="/about" className="hover:text-ink">
              About &amp; sources
            </Link>
            <span aria-hidden>·</span>
            <span title={`${GIT_SHA} · ${BUILD_DATE}`}>v{APP_VERSION}</span>
          </p>
        </footer>
        <FeedbackButton />
        <VersionWatcher />
        <Analytics />
      </body>
    </html>
  );
}
