/**
 * `/api/media`, the same-origin passthrough the canvas falls back to.
 *
 * `media-proxy.test.ts` covers which URLs are allowed; this covers what the route
 * does with one — that it never follows a redirect, never passes off a non-image as
 * an image, and never leaks S3's own error body (which names the bucket and key).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const BUCKET = "image-storage-original";
const ORIGIN = `https://${BUCKET}.s3.ap-south-1.amazonaws.com`;
const SIG =
  "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260816T120347Z&X-Amz-Expires=3600" +
  "&X-Amz-SignedHeaders=host" +
  "&X-Amz-Signature=0c3ee1c01ff94385ef9d9e78b36cc4a28112588942fd6404b434d953bcdfe2ed";
const S3 = `${ORIGIN}/free-projects/house-1/a.png?${SIG}`;

function request(url: string | null): NextRequest {
  const target =
    url === null
      ? "https://app.huevista.org/api/media"
      : `https://app.huevista.org/api/media?url=${encodeURIComponent(url)}`;
  return new NextRequest(target);
}

const fetchMock = vi.fn();

/** The route, imported fresh with the bucket configured. */
async function route() {
  vi.resetModules();
  vi.stubEnv("S3_BUCKET_NAME", BUCKET);
  vi.stubEnv("S3_REGION", "ap-south-1");
  return import("../route");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/media", () => {
  it("streams an allowed image back same-origin", async () => {
    const { GET } = await route();
    fetchMock.mockResolvedValue(
      new Response("bytes", { status: 200, headers: { "content-type": "image/png", etag: '"abc"' } }),
    );

    const res = await GET(request(S3));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe('"abc"');
    // Signed content must not sit in a shared cache for the next visitor.
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("bytes");
  });

  it("fetches the bucket we configured, not the string it was handed", async () => {
    const { GET } = await route();
    fetchMock.mockResolvedValue(new Response(null, { status: 200, headers: { "content-type": "image/png" } }));

    await GET(request(S3));

    expect(new URL(fetchMock.mock.calls[0]?.[0] as string).origin).toBe(ORIGIN);
    // A redirect could land anywhere; the origin check vouches for one hop only.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses a URL outside the allow-list without fetching it", async () => {
    const { GET } = await route();

    const res = await GET(request("https://169.254.169.254/latest/meta-data/"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing url parameter", async () => {
    const { GET } = await route();

    expect((await GET(request(null))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the upstream status through without its body", async () => {
    const { GET } = await route();
    // S3's 403 body is XML naming the bucket and key.
    fetchMock.mockResolvedValue(
      new Response("<Error><Key>free-projects/house-1/a.png</Key></Error>", {
        status: 403,
        headers: { "content-type": "application/xml" },
      }),
    );

    const res = await GET(request(S3));

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("free-projects");
  });

  it("refuses to serve something that is not an image", async () => {
    const { GET } = await route();
    fetchMock.mockResolvedValue(
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    expect((await GET(request(S3))).status).toBe(415);
  });

  it("answers 502 when S3 cannot be reached", async () => {
    const { GET } = await route();
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    expect((await GET(request(S3))).status).toBe(502);
  });

  it("falls back to the API's own bucket when this container was not told one", async () => {
    // The production failure this closes: S3_BUCKET_NAME is only ever read here, so
    // nobody set it on the web container and every image got 503 from a route whose
    // whole job was to rescue a blocked CORS load.
    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", "");
    vi.stubEnv("S3_REGION", "ap-south-1");
    const { GET } = await import("../route");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ provider: "s3", bucket: BUCKET, region: "ap-south-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("bytes", { status: 200, headers: { "content-type": "image/png" } }),
      );

    const res = await GET(request(S3));

    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/images/storage");
    expect(new URL(fetchMock.mock.calls[1]?.[0] as string).origin).toBe(ORIGIN);
  });

  it("answers 503 without fetching the image when no bucket can be resolved", async () => {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", "");
    const { GET } = await import("../route");
    // The API is unreachable too, so there is nothing to serve from.
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect((await GET(request(S3))).status).toBe(503);
    // One doomed lookup, and never a request for the image itself.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/images/storage");
  });
});
