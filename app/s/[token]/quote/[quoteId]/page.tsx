import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import QuoteAnalysis from "@/components/QuoteAnalysis";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { getCatalogue } from "@/lib/catalogue";
import { leaseToQuote, migrateLease, quoteLabel, vehicleName, type QuoteSpec } from "@/lib/au/lease";
import { decodeQuote } from "@/lib/au/quote";

/**
 * One quote's analysis, shared by link.
 *
 * Narrower than the lease share on purpose. A lease carries a salary, a
 * payslip and now a ledger of somebody's actual spending; a quote carries a
 * provider's document and what it implies. "Look at this quote" is a thing
 * people say, and it should not hand over the rest of a person's finances to
 * say it.
 *
 * So this selects the vehicle and the one quote, and nothing else — not the
 * notes, not the statement, not the scenario's salary. The capability is still
 * the lease's token, because that is where the token lives and revoking it
 * kills every link made from it at once; the quote id in the path picks which
 * of that lease's quotes is on show.
 *
 * Not indexed. It is somebody's own figures, and the link is a capability
 * rather than a publication.
 */

export const metadata: Metadata = {
  title: "A novated lease quote, decoded",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedQuotePage({
  params,
}: {
  params: Promise<{ token: string; quoteId: string }>;
}) {
  const { token, quoteId } = await params;

  const r = await query<{ id: string; vehicle: unknown; scenario: unknown }>(
    "select id, vehicle, scenario from leases where share_token = $1",
    [token],
  );
  const row = r.rows[0];
  if (!row) notFound();

  const q = await query<{ data: unknown }>(
    "select data from lease_quotes where lease_id = $1 order by created_at",
    [row.id],
  );

  /*
   * Rebuilt through migrateLease so a quote saved before a field existed is
   * read the same way here as everywhere else — and so the car is the lease's
   * car, which is what the figures were quoted against.
   *
   * The salary is deliberately dropped. It reaches the analysis only through
   * the scenario, it is not needed to solve a rate, and it is the one thing on
   * a lease nobody means to share.
   */
  const lease = migrateLease({
    version: 1,
    name: "",
    vehicle: row.vehicle,
    scenario: { ...(row.scenario as object), salary: 0 },
    quotes: q.rows.map((x) => x.data),
  });

  const spec = lease.quotes.find((x: QuoteSpec) => x.id === quoteId);
  if (!spec) notFound();

  const config = await getActiveConfig();
  const catalogue = await getCatalogue();
  const quote = leaseToQuote(lease, spec);

  /*
   * Decoded here, with the salary, and sent down without it.
   *
   * The salary is dropped from everything this page serialises — it is the one
   * thing on a lease nobody means to share. But a couple of findings cannot be
   * reached without it, and the most valuable is the one that spots an
   * employer keeping part of the tax saving: it works by testing whether the
   * unexplained part of a deduction is an even share of the tax that deduction
   * relieves, and there is no relief to measure against without an income.
   *
   * Left to decode in the browser, a shared quote therefore could not run that
   * test, and fell back to telling the reader that nothing explained a gap we
   * would have explained on the owner's own figures.
   *
   * So the decode happens on the server, where the salary is still in hand,
   * and only the conclusions travel. QuoteDecode has no salary field, and the
   * findings' wording names no salary either — what does reach the page is the
   * relief, which is about twice a gap the page already shows and so tells a
   * reader nothing they could not have worked out with a calculator.
   */
  const salary = spec.salary ?? (row.scenario as { salary?: number } | null)?.salary;
  const decode = decodeQuote(salary ? { ...quote, salary } : quote, config);
  // Empty rather than "Your car": the heading builds a sentence around it, and
  // "Provider A on a Your car" is what the default produces. Naming the car is
  // optional on a quote by design.
  const carName = vehicleName(lease.vehicle, catalogue, "");

  /*
   * What the reader is allowed to take with them.
   *
   * Built here, on the server, for one reason: a QuoteSpec can carry the
   * salary the quote was written against, and that is the sender's. Stripping
   * it in the browser would be stripping it after it had already been
   * serialised into the page, where anyone can read it — so it never leaves
   * this function. The rest of the spec is the provider's own document, which
   * is the thing being shared.
   *
   * The car goes across whole. Every field on it is already on screen above or
   * is about the vehicle rather than its driver, and a copy that lost the car
   * would make the reader retype what they were just shown.
   */
  const adoptable = {
    vehicle: lease.vehicle,
    quote: { ...spec, salary: undefined },
    leaseName: carName || `${quoteLabel(spec, "Shared")} quote`,
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <QuoteAnalysis
          quote={{ ...quote, salary: undefined }}
          config={config}
          carName={carName}
          providerLabel={quoteLabel(spec)}
          adoptable={adoptable}
          decode={decode}
        />
      </main>
    </>
  );
}
