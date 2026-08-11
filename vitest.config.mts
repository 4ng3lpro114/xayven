import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Scope: unit tests for pure/near-pure payment logic (signatures, checksum
 * verification, idempotent status transitions, authorization rules) — not
 * a full Next.js test environment. Route handlers stay thin by design (see
 * src/lib/payments/service.ts) precisely so the logic that matters is
 * testable here without spinning up the app.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
