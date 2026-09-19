/**
 * Runs every spec in this directory against the deployed site.
 *
 *   npm run e2e            headless
 *   npm run e2e -- --headed watch it happen, slowed down
 *
 * Credentials come from .env.local, which the npm script loads with
 * `node --env-file`. Nothing here reads a secret from the repo, and nothing
 * here should be given an account with admin rights.
 *
 * One browser for all specs, a fresh context per spec: contexts are cheap and
 * isolated, browsers are neither. A spec that throws outright still gets the
 * browser closed and the pool drained, or the process hangs on an open socket
 * and the run looks like a timeout rather than the error it was.
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, closeDb, launch, report } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const specs = readdirSync(here)
  .filter((f) => f.endsWith(".spec.mjs"))
  .sort();

console.log(`Running ${specs.length} spec${specs.length === 1 ? "" : "s"} against ${BASE}`);

const browser = await launch();
let crashed = null;

try {
  for (const file of specs) {
    const { default: run } = await import(`file://${join(here, file)}`);
    await run(browser);
  }
} catch (err) {
  crashed = err;
  console.error(`\nA spec threw before it could report:\n${err?.stack ?? err}`);
} finally {
  await browser.close();
  await closeDb();
}

process.exit(report() && !crashed ? 0 : 1);
