import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBffPathAllowed } from "@/lib/bff-paths";

/**
 * Every client call goes through the BFF proxy, which 403s any path missing from
 * its allow-list. That failure surfaces as an apparently-empty API response, not
 * as an obvious routing error: `api/me/assigned-products` shipped without its
 * entry and every redeemed customer was told their shop had assigned them
 * nothing. So hold the allow-list against the paths the client actually calls.
 */
function browserFetchPaths(): string[] {
  // Vitest runs from the project root (see vitest.config.ts).
  const source = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8");
  const paths = new Set<string>();
  // browserFetch<T>("api/...")  and  browserFetch<T>(`api/...${id}/...`)
  // Group 1 is the opening quote (back-referenced to find the close); group 2 is
  // the path itself.
  for (const match of source.matchAll(/browserFetch<[^>]*>\(\s*(["'`])((?:(?!\1).)*)\1/gs)) {
    // Keep the literal head; a `${...}` interpolation can only appear after the
    // prefix that decides whether the path is allowed.
    const head = match[2]!.split("${")[0]!.replace(/^\/+/, "");
    if (head.startsWith("api/")) paths.add(head);
  }
  return [...paths];
}

describe("BFF allow-list", () => {
  it("finds the API client's browserFetch paths", () => {
    // Guards the regex itself: a silent zero-match would make the test below vacuous.
    const paths = browserFetchPaths();
    expect(paths.length).toBeGreaterThan(20);
    expect(paths).toContain("api/projects");
  });

  it("permits every path the API client calls", () => {
    const blocked = browserFetchPaths().filter((p) => !isBffPathAllowed(p));
    expect(blocked).toEqual([]);
  });

  it("allows the redeemed customer's assigned products", () => {
    expect(isBffPathAllowed("api/me/assigned-products")).toBe(true);
  });

  it("allows every room created against an access code", () => {
    expect(isBffPathAllowed("api/access-codes/ac-1/projects")).toBe(true);
  });

  it("still refuses paths outside the allow-list", () => {
    // A prefix must match on a path boundary, not as a bare string prefix.
    expect(isBffPathAllowed("api/auth/login")).toBe(false);
    expect(isBffPathAllowed("api/admin/paint/shades")).toBe(false);
    expect(isBffPathAllowed("api/projects-secret")).toBe(false);
  });
});
