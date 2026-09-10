// Runs the Vitest suite, then records the results (per test, by area) into Postgres
// so the admin backoffice can show them. Usage: npm run test:record
import { spawnSync } from "child_process";
import { readFileSync, existsSync, rmSync } from "fs";
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/novated";
const OUT = "./.vitest-results.json";

// Mirror lib/db.ts sslFor: local dev / Railway's private network run
// unencrypted; any other host (e.g. the Railway public proxy used from CI)
// needs TLS with relaxed cert verification.
const sslFor = (u) =>
  !u || /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(u) || /\.railway\.internal[:/]/.test(u)
    ? false
    : { rejectUnauthorized: false };

console.log("Running the test suite…");
const proc = spawnSync(
  `npx vitest run --reporter=json --outputFile=${OUT}`,
  { stdio: "inherit", shell: true },
);
if (proc.error) {
  console.error("Failed to launch Vitest:", proc.error.message);
  process.exit(1);
}

if (!existsSync(OUT)) {
  console.error("No results file produced — did Vitest fail to start?");
  process.exit(1);
}

const json = JSON.parse(readFileSync(OUT, "utf8"));
rmSync(OUT, { force: true });

const results = [];
let durationTotal = 0;
let maxEnd = json.startTime;
for (const file of json.testResults ?? []) {
  maxEnd = Math.max(maxEnd, file.endTime ?? maxEnd);
  for (const a of file.assertionResults ?? []) {
    const area = a.ancestorTitles?.[0] || "General";
    const duration = Math.round(a.duration ?? 0);
    durationTotal += duration;
    results.push({
      area,
      name: a.title,
      status: a.status, // passed | failed | skipped | pending
      duration,
      error: a.failureMessages?.length ? a.failureMessages.join("\n\n") : null,
    });
  }
}

const c = new Client({ connectionString: url, ssl: sslFor(url) });
await c.connect();
const run = await c.query(
  `insert into test_runs (started_at, finished_at, total, passed, failed, skipped, duration_ms)
   values (to_timestamp($1/1000.0), to_timestamp($2/1000.0), $3, $4, $5, $6, $7) returning id`,
  [
    json.startTime,
    maxEnd,
    json.numTotalTests ?? results.length,
    json.numPassedTests ?? 0,
    json.numFailedTests ?? 0,
    (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0),
    durationTotal,
  ],
);
const runId = run.rows[0].id;

for (const r of results) {
  await c.query(
    `insert into test_results (run_id, area, name, status, duration_ms, error)
     values ($1,$2,$3,$4,$5,$6)`,
    [runId, r.area, r.name, r.status, r.duration, r.error],
  );
}

// Keep only the 20 most recent runs.
await c.query(
  `delete from test_runs where id in (
     select id from test_runs order by created_at desc offset 20
   )`,
);

console.log(
  `Recorded run ${runId}: ${json.numPassedTests}/${json.numTotalTests} passed` +
    (json.numFailedTests ? `, ${json.numFailedTests} FAILED` : ""),
);
await c.end();
// Recording the results IS this script's job, and any failures are captured,
// printed above, and shown on the admin page. So exit success once recording
// worked — a non-zero exit here means recording itself broke (e.g. the DB),
// not that a test failed. (Use `npm test` when you want the pass/fail gate.)
process.exit(0);
