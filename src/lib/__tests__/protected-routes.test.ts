import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every page under the `(app)` route group renders behind a layout that calls
 * `requireAccessToken()`, which only READS the short-lived access cookie — the
 * refresh that keeps it alive happens in middleware, where cookies are writable.
 * A route the middleware doesn't match therefore stops refreshing and bounces
 * the visitor to /sign-in the moment their access cookie ages out. That is how
 * `/assigned-products` broke for redeemed customers, who have no password and so
 * cannot sign in at all.
 *
 * middleware.ts carries the route list twice (Next requires `config.matcher` to
 * be a static literal), so this checks the app-group routes against both copies.
 */
const middlewareSource = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

function appGroupRoutes(): string[] {
  const dir = resolve(process.cwd(), "src/app/(app)");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => `/${e.name}`)
    .sort();
}

function protectedPrefixes(): string[] {
  const block = /const PROTECTED_PREFIXES = \[([\s\S]*?)\];/.exec(middlewareSource);
  expect(block, "PROTECTED_PREFIXES not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

function matcherEntries(): string[] {
  const block = /matcher: \[([\s\S]*?)\],\s*\};/.exec(middlewareSource);
  expect(block, "config.matcher not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("middleware route protection", () => {
  it("reads the app-group routes and both middleware lists", () => {
    // Guards the scanners themselves — empty results would make the checks vacuous.
    expect(appGroupRoutes().length).toBeGreaterThan(5);
    expect(protectedPrefixes().length).toBeGreaterThan(5);
    expect(matcherEntries().length).toBeGreaterThan(5);
  });

  it("gates every (app) route, so its access cookie is refreshed", () => {
    const prefixes = protectedPrefixes();
    const missing = appGroupRoutes().filter((r) => !prefixes.includes(r));
    expect(missing).toEqual([]);
  });

  it("matches every (app) route, so the middleware actually runs there", () => {
    const matcher = matcherEntries();
    const missing = appGroupRoutes().filter((r) => !matcher.includes(`${r}/:path*`));
    expect(missing).toEqual([]);
  });

  it("keeps the customer's assigned-products page protected", () => {
    expect(protectedPrefixes()).toContain("/assigned-products");
    expect(matcherEntries()).toContain("/assigned-products/:path*");
  });
});
