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

  // jsdom ships no ResizeObserver, but components (e.g. shade-grid) construct one
  // on mount. Provide an inert stub so mounting them in tests doesn't throw.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // Nor IntersectionObserver, which the dashboard's count-up figures use to start
  // counting when they scroll into view. Inert, so nothing ever "intersects" and the
  // component keeps its initial render — which is what a test asserting on content
  // wants anyway.
  if (typeof globalThis.IntersectionObserver === "undefined") {
    globalThis.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds: ReadonlyArray<number> = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }

  // jsdom implements neither smooth scrolling nor scrollTo on elements; chat
  // surfaces (support widget, staff inbox) scroll to the newest message on
  // every update. Inert stubs keep those effects from throwing in tests.
  if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => {};
  }

  // jsdom has no matchMedia, and anything that respects prefers-reduced-motion
  // (the dashboard's count-up figures, for one) calls it on mount. Report "no
  // preference" so animated components take their ordinary path in tests rather
  // than the reduced-motion branch — the reduced path is the one worth opting
  // into explicitly when a test is about it.
  if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
}
