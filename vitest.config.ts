import path from "node:path";

import { defineConfig } from "vitest/config";

// Standalone Vitest config that avoids the Cloudflare/TanStack Vite plugins so
// the pure business-logic modules can be unit tested in a plain Node context.
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    coverage: {
      include: ["src/lib/teams-logic.ts"],
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
