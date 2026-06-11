import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // Next.js requires `jsx: "preserve"` in tsconfig, which the test transformer
  // (rolldown-vite/oxc) would otherwise honour and ship raw JSX. Compile it
  // with the automatic React runtime for the test runner instead.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
