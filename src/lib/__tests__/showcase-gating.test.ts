import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The placeholder editorial pages (/gallery, /work, /journal) are withheld in
 * middleware, which carries the route list twice — once as SHOWCASE_PREFIXES and
 * once in `config.matcher`, because Next requires the matcher to be a static
 * literal. A prefix missing from the matcher means the middleware never runs for
 * that path and the page renders its invented rooms and bylines to the public.
 *
 * The other half — that the header and footer never offer a link to a withheld
 * page — is covered behaviourally in components/layout/__tests__/showcase-links.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const middlewareSource = read("src/middleware.ts");

function showcasePrefixes(): string[] {
  const block = /const SHOWCASE_PREFIXES = \[([\s\S]*?)\];/.exec(middlewareSource);
  expect(block, "SHOWCASE_PREFIXES not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

function matcherEntries(): string[] {
  const block = /matcher: \[([\s\S]*?)\],\s*\};/.exec(middlewareSource);
  expect(block, "config.matcher not found in middleware.ts").not.toBeNull();
  return [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("showcase content gating", () => {
  it("reads a non-empty prefix list", () => {
    expect(showcasePrefixes().length).toBeGreaterThan(0);
  });

  it("matches every withheld prefix, so the middleware actually runs there", () => {
    const matcher = matcherEntries();
    const missing = showcasePrefixes().filter((p) => !matcher.includes(`${p}/:path*`));
    expect(missing).toEqual([]);
  });

  it("gates the pages whose content is placeholder material", () => {
    expect(showcasePrefixes().sort()).toEqual(["/gallery", "/journal", "/work"]);
  });

  it("keeps the gate off by default, so the pages stay unpublished", () => {
    // A default of "on" would publish them on any host that forgets the env var.
    expect(read("src/lib/showcase.ts")).toContain(
      'process.env.NEXT_PUBLIC_SHOWCASE_CONTENT === "1"',
    );
  });

});
