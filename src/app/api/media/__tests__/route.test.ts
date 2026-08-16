/**
 * `/api/media`, the same-origin passthrough the canvas falls back to.
 *
 * `media-proxy.test.ts` covers which URLs are allowed; this covers what the route
 * does with one — that it never forwards a redirect, never passes off a non-image
 * as an image, and never leaks S3's own error body (which names the bucket and key).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const SIG = "X-Amz-Signature=0c3ee1c01ff94385ef9d9e78b36cc4a28112588942fd6404b434d953bcdfe2ed";
const S3 = `https://image-storage-original.s3.ap-south-1.amazonaws.com/free-projects/house-1/a.png?${SIG}`;

function request(url: string | null): NextRequest {
  const target = url === null
    ? "https://app.huevista.org/api/media"
    : `https://app.huevista.org/api/media?url=${encodeURIComponent(url)}`;
  return new NextRequest(target);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/media", () => {
  it("streams an allowed image back same-origin", async () => {
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

  it("never follows a redirect off the allow-listed host", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200, headers: { "content-type": "image/png" } }));

    await GET(request(S3));

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses a URL outside the allow-list without fetching it", async () => {
    const res = await GET(request("https://169.254.169.254/latest/meta-data/"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing url parameter", async () => {
    expect((await GET(request(null))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the upstream status through without its body", async () => {
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
    fetchMock.mockResolvedValue(
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    expect((await GET(request(S3))).status).toBe(415);
  });

  it("answers 502 when S3 cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    expect((await GET(request(S3))).status).toBe(502);
  });
});
