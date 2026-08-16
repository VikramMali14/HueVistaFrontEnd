/**
 * The `/api/media` allow-list.
 *
 * The route fetches a URL the caller supplied, which is the shape of every SSRF
 * hole ever written, so these cases are the security boundary rather than a
 * formatting check. Anything that gets past `resolveProxyTarget` is something this
 * server will connect to.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveProxyTarget } from "../media-proxy";

const SIG =
  "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260816T120347Z&X-Amz-Expires=3600" +
  "&X-Amz-Signature=0c3ee1c01ff94385ef9d9e78b36cc4a28112588942fd6404b434d953bcdfe2ed";

const PRESIGNED =
  "https://image-storage-original.s3.ap-south-1.amazonaws.com/free-projects/house-1/e967e0d6.png?" + SIG;

describe("resolveProxyTarget", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts the presigned URL the backend actually hands out", () => {
    // Verbatim from the CORS failure this route exists to work around.
    expect(resolveProxyTarget(PRESIGNED)?.toString()).toBe(PRESIGNED);
  });

  it("accepts path-style addressing", () => {
    const url = `https://s3.ap-south-1.amazonaws.com/image-storage-original/a/b.png?${SIG}`;
    expect(resolveProxyTarget(url)).not.toBeNull();
  });

  it("accepts the pre-2019 dashed region host", () => {
    const url = `https://image-storage-original.s3-ap-south-1.amazonaws.com/a/b.png?${SIG}`;
    expect(resolveProxyTarget(url)).not.toBeNull();
  });

  it("refuses an unsigned URL", () => {
    // Without a signature the caller is naming an object rather than presenting a
    // capability, which would make this a relay for every public object in the region.
    expect(resolveProxyTarget("https://image-storage-original.s3.ap-south-1.amazonaws.com/a.png")).toBeNull();
  });

  it("refuses hosts that are not S3 in our region", () => {
    for (const url of [
      `https://evil.example.com/a.png?${SIG}`,
      // Looks like S3, is a different service.
      `https://x.s3-control.ap-south-1.amazonaws.com/a.png?${SIG}`,
      // Right service, wrong region — nothing we store lives there.
      `https://x.s3.us-east-1.amazonaws.com/a.png?${SIG}`,
      // The classic SSRF target, and a scheme downgrade.
      `http://169.254.169.254/latest/meta-data/?${SIG}`,
      `http://image-storage-original.s3.ap-south-1.amazonaws.com/a.png?${SIG}`,
      // A host that merely ENDS with the real one.
      `https://s3.ap-south-1.amazonaws.com.evil.example/a.png?${SIG}`,
    ]) {
      expect(resolveProxyTarget(url), url).toBeNull();
    }
  });

  it("refuses a missing or unparseable url parameter", () => {
    expect(resolveProxyTarget(null)).toBeNull();
    expect(resolveProxyTarget("")).toBeNull();
    expect(resolveProxyTarget("not a url")).toBeNull();
    expect(resolveProxyTarget("/a/relative/path.png")).toBeNull();
  });

  it("pins to one bucket when S3_BUCKET_NAME is configured", async () => {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", "image-storage-original");
    const { resolveProxyTarget: pinned } = await import("../media-proxy");

    expect(pinned(PRESIGNED)).not.toBeNull();
    // Somebody else's bucket, in our region, correctly signed by them.
    expect(pinned(`https://someone-elses.s3.ap-south-1.amazonaws.com/a.png?${SIG}`)).toBeNull();
    expect(pinned(`https://s3.ap-south-1.amazonaws.com/someone-elses/a.png?${SIG}`)).toBeNull();
  });
});
