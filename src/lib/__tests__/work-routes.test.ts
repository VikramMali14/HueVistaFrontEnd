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

  it("builds the allow-list from WORKS itself, not a second hand-kept copy", () => {
    expect(middlewareSource).toContain("new Set(WORKS.map((w) => w.slug))");
  });

  it("rewrites to a 404 rather than letting the page answer", () => {
    const guard = /pathname\.startsWith\("\/work\/"\)[\s\S]*?\n  \}/.exec(middlewareSource);
    expect(guard, "the /work/ guard is gone from middleware.ts").not.toBeNull();
    expect(guard![0]).toContain("status: 404");
  });

  it("resolves every slug the allow-list would admit", () => {
    for (const w of WORKS) expect(getWork(w.slug)).toBeDefined();
  });

  it("has slugs at all, so the checks above are not vacuous", () => {
    expect(WORKS.length).toBeGreaterThan(0);
    expect(new Set(WORKS.map((w) => w.slug)).size).toBe(WORKS.length);
  });
});
