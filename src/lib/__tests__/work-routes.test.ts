import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORKS, getWork } from "@/lib/work";

/**
 * /work/[slug] answers an unknown slug with a real 404, and that answer comes
 * from middleware rather than the page.
 *
 * The page's own `notFound()` cannot set the status: `await params` marks the
 * request dynamic, the response starts streaming, and by the time notFound()
 * throws Next has already committed a 200. The symptom is quiet and bad — the
 * 404 UI served under a 200, titled "Our work", indexed by crawlers as a real
 * page — so the guard lives in middleware, which runs before anything is sent.
 *
 * Two halves have to stay true, and neither is visible from the other:
 * the guard has to exist, and `config.matcher` has to actually route /work/*
 * through the middleware. Next requires the matcher to be a static literal, so
 * it cannot be derived from the guard.
 */
const middlewareSource = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

function matcherEntries(): string[] {
  const block = /matcher: \[([\s\S]*?)\],\s*\};/.exec(middlewareSource);
  expect(block, "config.matcher not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("/work/[slug] routing", () => {
  it("runs the middleware for /work/*, or the guard never fires", () => {
    expect(matcherEntries()).toContain("/work/:path*");
  });

  it("builds the fallback allow-list from WORKS itself, not a second hand-kept copy", () => {
    expect(middlewareSource).toContain("new Set(WORKS.map((w) => w.slug))");
  });

  it("rewrites to a 404 rather than letting the page answer", () => {
    const guard = /pathname\.startsWith\("\/work\/"\)[\s\S]*?\n  \}/.exec(middlewareSource);
    expect(guard, "the /work/ guard is gone from middleware.ts").not.toBeNull();
    expect(guard![0]).toContain("status: 404");
  });

  /**
   * The portfolio is admin-published now, so the guard cannot be a static list.
   * Two ways for it to be wrong, and both are silent: 404ing a room an admin
   * just published, or waving through a built-in slug that stopped resolving the
   * moment real work went up. The fix for both is that the middleware asks the
   * same question the page asks.
   */
  it("asks the backend which rooms are on the portfolio", () => {
    expect(middlewareSource).toContain("/api/free-projects?surface=WORK");
  });

  it("falls back to the built-ins only when nothing is published, like the page does", () => {
    expect(middlewareSource).toContain("published.length > 0 ? new Set(published) : BUILT_IN_WORK_SLUGS");
  });

  /**
   * A backend blip must not delete the portfolio from the internet. Letting the
   * request through costs the correct status on a page that still renders; the
   * alternative tells every crawler that every project is gone.
   */
  it("lets the request through when it cannot tell, rather than 404ing", () => {
    const guard = /pathname\.startsWith\("\/work\/"\)[\s\S]*?\n  \}/.exec(middlewareSource);
    expect(guard![0]).toContain("if (valid && !valid.has(slug))");
  });

  /**
   * A room published seconds ago looks exactly like a typo to a cache that has
   * not refreshed. Serving the stale answer there is how an admin publishes a
   * room, sees its card on /work, clicks it and gets "not found" — so the slug
   * being asked about has to reach the lookup, and a miss has to re-read.
   */
  it("re-reads on a slug it does not know, so a fresh room is not 404'd", () => {
    expect(middlewareSource).toContain("workSlugs(slug)");
    expect(middlewareSource).toContain("if (fresh && cachedWorkSlugs.has(wanted)) return cachedWorkSlugs;");
    expect(middlewareSource).toContain("WORK_SLUG_MISS_REFRESH_MS");
  });

  it("resolves every slug the fallback allow-list would admit", () => {
    for (const w of WORKS) expect(getWork(w.slug)).toBeDefined();
  });

  it("has slugs at all, so the checks above are not vacuous", () => {
    expect(WORKS.length).toBeGreaterThan(0);
    expect(new Set(WORKS.map((w) => w.slug)).size).toBe(WORKS.length);
  });
});
