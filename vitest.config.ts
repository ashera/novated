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
});
