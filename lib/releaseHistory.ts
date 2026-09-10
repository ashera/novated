// Curated release history for the /releases changelog, backfilled on deploy (see
// seedReleases in migrations.ts). New releases are drafted automatically from the
// commits on each deploy and then edited and published in the backoffice — this
// file only carries the history that predates that mechanism.

export interface SeedRelease {
  version: string;
  build: number | null;
  commit: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes: string[];
}

export const RELEASE_HISTORY: SeedRelease[] = [
  {
    version: "1.0.1",
    build: 1,
    commit: "",
    date: "2026-09-10",
    title: "First release",
    notes: [
      "Work out what a novated lease would really cost you, on your own salary and the car you have in mind.",
      "See the pre-tax and post-tax split of every deduction, and exactly what the tax saving is worth.",
      "Understand fringe benefits tax, the employee contribution method, and when the electric vehicle exemption applies.",
      "Compare the lease against buying the same car with a car loan or with cash, over the same term.",
      "Save your scenarios, share them with a link, and print a report to take to your employer or lease provider.",
    ],
  },
];
