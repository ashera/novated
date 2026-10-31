import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import PayBreakdown from "@/components/PayBreakdown";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { getCatalogue } from "@/lib/catalogue";
import {
  leaseToInputs,
  leaseToQuote,
  migrateLease,
  quoteLabel,
  vehicleName,
  type QuoteSpec,
} from "@/lib/au/lease";
import { calculateLease } from "@/lib/au/novated";
import { decodeQuote } from "@/lib/au/quote";

/**
 * The pay deduction, broken down, shared by link.
 *
 * Built for the lease holder's accountant: somebody holding a payslip who
 * wants to know what the salary-sacrifice line is composed of and whether it
 * adds up. That is a narrower question than "look at my lease", and this is
 * correspondingly narrower than the lease share.
 *
 * The salary is set to zero before anything is calculated.
 *
 * That is not a redaction applied to the output — it is an input the page
 * never has. Every component of the deduction (the lease payment, each running
 * cost, the fee, the FBT and the reportable amount) is salary-independent, so
 * zeroing it changes none of them, and a test pins that so the guarantee
 * cannot quietly lapse. What it does remove is the tax relief, the take-home
 * figures and the net cost of the car, none of which this page shows or needs.
 *
 * Notes and the statement ledger are not selected, as everywhere else. The
 * capability is the lease's own token, so revoking the link kills this view
 * along with every other made from it.
 *
 * Not indexed: somebody's own figures, reached by capability rather than
 * published.
 */

export const metadata: Metadata = {
  title: "Novated lease — pay deduction breakdown",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedPayBreakdownPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const r = await query<{ id: string; name: string; vehicle: unknown; scenario: unknown }>(
    "select id, name, vehicle, scenario from leases where share_token = $1",
    [token],
  );
  const row = r.rows[0];
  if (!row) notFound();

  const q = await query<{ data: unknown }>(
    "select data from lease_quotes where lease_id = $1 order by created_at",
    [row.id],
  );

  const lease = migrateLease({
    version: 1,
    name: row.name,
    vehicle: row.vehicle,
    // Zeroed here, before the engine sees it — see the note above.
    scenario: { ...(row.scenario as object), salary: 0 },
    quotes: q.rows.map((x) => x.data),
  });

  const config = await getActiveConfig();
  const catalogue = await getCatalogue();
  const result = calculateLease(leaseToInputs(lease), config);

  /*
   * The quote the lease is actually modelled on, where there is one.
   *
   * This is the correction that made the page worth having. The engine
   * re-derives the amount financed from the car's price and the GST credit it
   * believes is available, which on a real lease came to $84,429 against a
   * quote written over $78,095 — and a deduction of $1,945 a month against a
   * payslip of $1,780. Neither figure is a bug in the engine; they answer
   * different questions. But a page explaining a payslip has to answer the
   * provider's, so where a quote is attached its own lines are used.
   *
   * Decoded without the salary, like everything else here. None of the lines,
   * the amount financed or the solved rate depend on one.
   */
  const spec = lease.scenario.fromQuoteId
    ? lease.quotes.find((q: QuoteSpec) => q.id === lease.scenario.fromQuoteId)
    : undefined;
  const quote = spec
    ? {
        decode: decodeQuote(leaseToQuote(lease, spec), config),
        provider: quoteLabel(spec, "the provider"),
        spec,
      }
    : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <PayBreakdown
          result={result}
          config={config}
          carName={vehicleName(lease.vehicle, catalogue, "")}
          leaseName={row.name}
          quote={quote}
          vehicle={lease.vehicle}
          commencementDate={lease.scenario.commencementDate}
        />
      </main>
    </>
  );
}
