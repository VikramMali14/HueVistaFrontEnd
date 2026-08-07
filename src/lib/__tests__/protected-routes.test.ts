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

function guestOnlyPaths(): string[] {
  const block = /const GUEST_ONLY_PATHS = \[([\s\S]*?)\];/.exec(middlewareSource);
  expect(block, "GUEST_ONLY_PATHS not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/**
 * Somebody already holding an account has no business on a page that opens one.
 * Both signup routes are covered — /join creates the CUSTOMER account and /trial
 * creates the SHOP account. /trial was the hole: it was documented as a "lead
 * form" that created nothing, when it takes a password and opens a shop, so a
 * signed-in shop could register a second one straight from the pricing page.
 */
describe("middleware guest-only pages", () => {
  it("closes both signup routes and the sign-in pages to signed-in users", () => {
    const guest = guestOnlyPaths();
    for (const path of ["/sign-in", "/sign-in/forgot", "/join", "/trial"]) {
      expect(guest, `${path} must be guest-only`).toContain(path);
    }
  });

  it("matches every guest-only path, so the bounce actually runs", () => {
    const matcher = matcherEntries();
    const missing = guestOnlyPaths().filter((p) => !matcher.includes(p));
    expect(missing).toEqual([]);
  });

  it("leaves the Google callback open — it runs before the session cookies exist", () => {
    expect(guestOnlyPaths()).not.toContain("/sign-in/google");
    expect(matcherEntries()).not.toContain("/sign-in/google");
  });
});
