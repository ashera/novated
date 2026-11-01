import { describe, it, expect } from "vitest";
import {
  mergeRemittances,
  parseRemittanceCsv,
  reconcileGst,
  type RemittanceRow,
} from "@/lib/au/remittance";
import { rowKey } from "@/lib/au/statementLog";
import type { StatementRow } from "@/lib/au/statement";

/**
 * Reconciling the employer's GST remittances against the provider's credits.
 *
 * Built from a real pair of documents — an accounting export of the GST an
 * employer paid across, and the lease account's own statement — with the
 * provider renamed, since this repository is public.
 *
 * The shape of that data is the whole design brief. The employer remits the
 * GST on the rental and on the management fee in one payment ($149.61); the
 * provider credits only the rental ($145.71); the difference is the fee's GST
 * and it is the same $3.90 every month. And the credits arrive late — one
 * batch of five months landed on a single day, 158 days after the first of
 * them was paid.
 */

const PROVIDER = "Provider A Pty Ltd - Vehicle Lease Total GST Paid On Purchases";

const CSV = `Date,Account,Reference,Details,Gross,GST,Net
21/11/2025,GST (820),MIS,${PROVIDER},149.61,0.00,149.61
21/11/2025,GST (820),MIS,${PROVIDER},3.90,0.00,3.90
05/12/2025,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/01/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/02/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/03/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/04/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/05/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61
05/06/2026,GST (820),GST,${PROVIDER},149.61,0.00,149.61`;

const credit = (date: string, amount: number): StatementRow => ({
  date,
  description: "GST Credits",
  amount,
  balance: null,
  kind: "gst-credit",
});

/** The credits the real statement carried, in its own order. */
const LEDGER: StatementRow[] = [
  credit("2025-11-24", 145.71),
  credit("2026-01-14", 145.71),
  credit("2026-01-14", 145.71),
  credit("2026-02-24", 145.71),
  credit("2026-08-10", 179.62),
  credit("2026-08-10", 145.71),
  credit("2026-08-10", 145.71),
  credit("2026-08-10", 145.71),
  credit("2026-08-10", 145.71),
  credit("2026-08-10", 145.71),
  credit("2026-09-04", 218.25),
  credit("2026-10-06", 275.4),
  // Not a GST credit, and must be ignored entirely.
  { date: "2026-10-15", description: "Lease - Financier", amount: -1602.81, balance: null, kind: "finance" },
];

describe("Employer GST remittances", () => {
  describe("reading the export", () => {
    const parsed = parseRemittanceCsv(CSV);

    it("finds the columns it needs without being told", () => {
      expect(parsed.columns).toEqual({
        date: "Date",
        description: "Details",
        amount: "Gross",
      });
    });

    it("reads every row and skips none", () => {
      expect(parsed.rows).toHaveLength(9);
      expect(parsed.skipped).toEqual([]);
    });

    /*
     * The one that would be invisible if it went wrong. 05/06/2026 is June
     * here and May in American order — not a parse failure but a date eleven
     * months out that reconciles against the wrong month and looks fine doing
     * it.
     */
    it("reads dates day-first, as the export was written", () => {
      expect(parsed.rows.map((r) => r.date)).toEqual([
        "2025-11-21",
        "2025-11-21",
        "2025-12-05",
        "2026-01-05",
        "2026-02-05",
        "2026-03-05",
        "2026-04-05",
        "2026-05-05",
        "2026-06-05",
      ]);
    });

    it("disambiguates a date when one field settles it", () => {
      const us = parseRemittanceCsv("Date,Details,Gross\n12/25/2025,x,10.00");
      expect(us.rows[0].date).toBe("2025-12-25");
    });

    it("takes the gross paid, not the GST column on it", () => {
      // The export's own GST column reads 0.00 — there is no GST on a GST
      // remittance — and using it would report that nothing was ever paid.
      expect(parsed.rows.map((r) => r.amount)).toContain(149.61);
      expect(parsed.rows.every((r) => r.amount > 0)).toBe(true);
    });

    it("refuses rather than guesses when it cannot name the columns", () => {
      const bad = parseRemittanceCsv("foo,bar\n1,2");
      expect(bad.rows).toEqual([]);
      expect(bad.columns).toBeNull();
    });

    it("keeps quoted commas inside a field", () => {
      const q = parseRemittanceCsv('Date,Details,Gross\n05/06/2026,"Smith, J - lease",10.00');
      expect(q.rows[0].description).toBe("Smith, J - lease");
    });
  });

  describe("reconciling against the provider's credits", () => {
    const rows = parseRemittanceCsv(CSV).rows;
    const rec = reconcileGst(LEDGER, rows, rowKey);

    it("pairs every recurring payment with a credit", () => {
      const paired = rec.pairs.filter((p) => p.credit != null);
      expect(paired).toHaveLength(8);
      expect(paired.every((p) => p.remittance.amount === 149.61)).toBe(true);
      expect(paired.every((p) => p.credit!.amount === 145.71)).toBe(true);
    });

    /* The explanation the whole card is built around: one number, every
       month, and it is the GST on the management fee. */
    it("finds the one difference they all share", () => {
      expect(rec.commonDifference).toBeCloseTo(3.9, 2);
    });

    /*
     * Why a size band exists. On pure date order the stray $3.90 took the
     * next $145.71 credit simply by being next in the queue, reporting a
     * $141.81 discrepancy that was never real.
     */
    it("leaves a payment it cannot place unplaced, rather than forcing it", () => {
      const stray = rec.pairs.find((p) => p.remittance.amount === 3.9)!;
      expect(stray.credit).toBeNull();
    });

    /* And the same band the other way: an odd credit is not swept up by a
       payment that happens to precede it. */
    it("does not pair a credit carrying something else", () => {
      expect(rec.unmatchedCredits.map((c) => c.amount)).toContain(179.62);
      expect(rec.unmatchedCredits.map((c) => c.amount)).toContain(275.4);
    });

    it("ignores everything on the statement that is not a GST credit", () => {
      const all = [...rec.pairs.map((p) => p.credit), ...rec.unmatchedCredits];
      expect(all.every((c) => c == null || c.kind === "gst-credit")).toBe(true);
    });

    /* The finding worth having: money remitted in March reaching the lease
       account in August. */
    it("measures how long the money waited", () => {
      expect(rec.worstLagDays).toBe(158);
      const prompt = rec.pairs.find((p) => p.remittance.date === "2025-11-21" && p.credit);
      expect(prompt!.lagDays).toBe(3);
    });

    /*
     * The totals are not comparable here and the result says so. An export
     * ending in June against a ledger running to October shows a shortfall
     * that is only the window; a reader told "outstanding" with nothing else
     * would draw exactly the wrong conclusion.
     */
    it("says when the two sides cover different periods", () => {
      expect(rec.windowsComparable).toBe(false);
      expect(rec.remittanceWindow).toEqual({ from: "2025-11-21", to: "2026-06-05" });
      expect(rec.creditWindow).toEqual({ from: "2025-11-24", to: "2026-10-06" });
    });

    it("totals both sides", () => {
      expect(rec.totalRemitted).toBeCloseTo(1_200.78, 2);
      expect(rec.totalCredited).toBeCloseTo(1_984.66, 2);
    });
  });

  describe("a pairing fixed by hand", () => {
    const base = parseRemittanceCsv(CSV).rows;

    it("beats the automatic queue to its credit", () => {
      const target = LEDGER[3]; // 2026-02-24
      const pinned: RemittanceRow[] = base.map((r) =>
        r.date === "2026-06-05" ? { ...r, matchKey: rowKey(target) } : r,
      );
      const rec = reconcileGst(LEDGER, pinned, rowKey);
      const june = rec.pairs.find((p) => p.remittance.date === "2026-06-05")!;
      expect(june.credit?.date).toBe("2026-02-24");
      expect(june.pinned).toBe(true);
      // And nobody else got it.
      expect(
        rec.pairs.filter((p) => p.credit?.date === "2026-02-24"),
      ).toHaveLength(1);
    });

    it("can say a payment pairs with nothing, and be believed", () => {
      const pinned: RemittanceRow[] = base.map((r) =>
        r.date === "2025-11-24" || r.amount === 149.61 ? { ...r, matchKey: null } : r,
      );
      const rec = reconcileGst(LEDGER, pinned, rowKey);
      expect(rec.pairs.filter((p) => p.remittance.amount === 149.61).every((p) => p.credit === null)).toBe(
        true,
      );
    });
  });

  describe("folding a fresh export into what is kept", () => {
    const rows = parseRemittanceCsv(CSV).rows;

    it("adds nothing when the same export is loaded twice", () => {
      const again = mergeRemittances(rows, rows);
      expect(again.added).toBe(0);
      expect(again.rows).toHaveLength(rows.length);
    });

    it("keeps both of two identical payments on one day", () => {
      // The export really does carry two rows dated 21/11/2025.
      const sameDay = rows.filter((r) => r.date === "2025-11-21");
      expect(sameDay).toHaveLength(2);
      const merged = mergeRemittances([], sameDay);
      expect(merged.rows).toHaveLength(2);
    });

    it("adds only what is new", () => {
      const extra: RemittanceRow = {
        date: "2026-07-05",
        description: PROVIDER,
        amount: 149.61,
      };
      const merged = mergeRemittances(rows, [...rows, extra]);
      expect(merged.added).toBe(1);
      expect(merged.rows).toHaveLength(rows.length + 1);
    });
  });
});
