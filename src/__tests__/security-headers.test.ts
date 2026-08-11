import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The security headers are the one piece of configuration whose mistakes are
 * invisible until a real browser refuses to render the site — nothing in a build
 * or a type check objects to a policy that blocks the site's own images. Both
 * cases below were live on production, reported as console errors.
 *
 * Loading next.config.ts directly is the point: these values are computed at
 * module load from the environment, and `next build` bakes them into the routes
 * manifest, so what this asserts is what a container actually serves.
 */

type Header = { key: string; value: string };

async function headersFor(env: Record<string, string | undefined>): Promise<Map<string, string>> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  const { default: config } = await import("../../next.config");
  const groups = (await config.headers!()) as { source: string; headers: Header[] }[];
  const global = groups.find((g) => g.source === "/:path*")!;
  return new Map(global.headers.map((h) => [h.key, h.value]));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Permissions-Policy", () => {
  it("names no feature the browser will reject", async () => {
    const value = (await headersFor({})).get("Permissions-Policy")!;

    // 'interest-cohort' was the FLoC opt-out. FLoC is gone, the feature name with
    // it, and an unrecognised name only earns an error on every page load:
    //   Error with Permissions-Policy header: Unrecognized feature: 'interest-cohort'.
    expect(value).not.toContain("interest-cohort");

    // Still locking down what we did lock down.
    expect(value).toContain("microphone=()");
    expect(value).toContain("geolocation=()");
    expect(value).toContain("camera=(self)");
  });
});

describe("Content-Security-Policy img-src", () => {
  async function imgSrc(env: Record<string, string | undefined>): Promise<string> {
    const csp = (await headersFor(env)).get("Content-Security-Policy")!;
    return csp.split("; ").find((d) => d.startsWith("img-src "))!;
  }

  it("allows the public API host in a production build with nothing configured", async () => {
    // The regression: an unset NEXT_PUBLIC_API_ORIGIN fell back to localhost, so
    // the shipped policy allowed an origin no visitor can reach while the pages
    // pointed <img> at the real API. Every site-asset image was blocked.
    const directive = await imgSrc({ NODE_ENV: "production", NEXT_PUBLIC_API_ORIGIN: undefined });

    expect(directive).toContain("https://api.huevista.org");
    expect(directive).not.toContain("localhost");
  });

  it("treats an empty variable as unset rather than as an origin", async () => {
    // `docker run -e NEXT_PUBLIC_API_ORIGIN=` hands us "", which `??` would have
    // accepted and spliced into the policy as nothing at all.
    const directive = await imgSrc({ NODE_ENV: "production", NEXT_PUBLIC_API_ORIGIN: "" });

    expect(directive).toContain("https://api.huevista.org");
  });

  it("honours a configured origin, trailing slash and all", async () => {
    const directive = await imgSrc({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_ORIGIN: "https://api.staging.example/",
    });

    expect(directive).toContain("https://api.staging.example");
    expect(directive).not.toContain("https://api.huevista.org");
    expect(directive).not.toContain("example/ ");
  });

  it("keeps localhost as a development default only", async () => {
    const directive = await imgSrc({ NODE_ENV: "development", NEXT_PUBLIC_API_ORIGIN: undefined });

    expect(directive).toContain("http://localhost:8080");
  });

  it("allows S3 in the configured region, and the extra hosts", async () => {
    const directive = await imgSrc({
      NODE_ENV: "production",
      S3_REGION: "eu-west-1",
      IMAGE_REMOTE_HOSTS: "https://cdn.example, https://media.example",
    });

    expect(directive).toContain("https://*.s3.eu-west-1.amazonaws.com");
    expect(directive).toContain("https://cdn.example");
    expect(directive).toContain("https://media.example");
  });
});
