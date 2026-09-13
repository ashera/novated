import Link from "next/link";

/**
 * Who is behind the numbers, said before the numbers.
 *
 * Almost every novated lease calculator on the web belongs to a company that
 * earns a commission on the lease it is quietly steering you towards. A reader
 * who does not know that assumes this one is the same, and reads everything
 * here as a sales pitch — which is the exact opposite of what the site is for.
 *
 * So it goes at the top, in one line, stated plainly. This is not the legal
 * warning: that is the general-advice disclosure, it belongs with the figures
 * it qualifies, and it is a different job. This is positioning, and positioning
 * is worthless at the bottom of the page.
 *
 * Every claim here has to stay literally true. The moment a referral deal or a
 * sponsored listing exists, this component is the first thing to change — and
 * the provider directory is the part most likely to be misread as a partner
 * list, which is why it is named.
 *
 * The link names what /about actually contains and no more. It briefly said
 * "how this is funded" while that page had no answer, which is worse than
 * silence: it puts the thought of a hidden revenue model in the reader's head
 * and then abandons them with it. The page answers it now, so the link can.
 */
export default function Independence({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      <strong className="font-semibold text-subtle">Free to use, and independent.</strong>{" "}
      We aren&apos;t a lease provider, we don&apos;t sell leases or finance, and we earn no
      commission or referral fee from anyone who does. No provider pays to appear here, and being
      listed isn&apos;t a recommendation.{" "}
      <Link href="/about" className="font-medium text-accent hover:underline">
        Why it exists, and how it&apos;s paid for
      </Link>
      .
    </p>
  );
}
