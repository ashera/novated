import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (from tsconfig.json) so tests can import app/ and
// lib/ modules that use it — e.g. app/sitemap.ts. Otherwise vitest, which does not
// read tsconfig paths by default, fails with "Cannot find package '@/...'".
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    /*
     * e2e/ is not vitest's.
     *
     * Those specs drive a real browser against the deployed site and need
     * credentials from .env.local, which vitest does not load — so left to the
     * default glob they are collected by `npm test`, fail on a missing
     * environment variable, and turn a green suite red for a reason that has
     * nothing to do with the code. They have their own runner: `npm run e2e`.
     */
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
  },
});
