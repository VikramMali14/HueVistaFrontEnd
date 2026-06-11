/**
 * Shared Vitest setup (wired via `setupFiles` in vitest.config.ts).
 *
 * - Registers the jest-dom matchers (`toBeInTheDocument`, …) on Vitest's expect.
 * - Registers React Testing Library's `cleanup` after each test. RTL's built-in
 *   auto-cleanup relies on a global `afterEach`, which only exists with
 *   `globals: true` — this project imports test APIs explicitly, so we hook it
 *   up here instead. Guarded so plain node-environment unit tests skip it.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
