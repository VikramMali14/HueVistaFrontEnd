/**
 * What `/api/media` will connect to.
 *
 * The route fetches on a caller's behalf, which is the shape of every SSRF hole ever
 * written, so these cases are the security boundary rather than a formatting check.
 * The claim under test is narrow and total: the ORIGIN comes from configuration and
 * nothing a caller sends can move it, and every other part of the URL is rebuilt from
 * validated pieces rather than forwarded.
 *
 * The module reads its configuration once at import, so each case imports it fresh
 * under the environment it wants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SIG =
  "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260816T120347Z&X-Amz-Expires=3600" +
  "&X-Amz-SignedHeaders=host" +
  "&X-Amz-Credential=AKIAWVVWDMJXVA2IJ57J%2F20260816%2Fap-south-1%2Fs3%2Faws4_request" +
  "&X-Amz-Signature=0c3ee1c01ff94385ef9d9e78b36cc4a28112588942fd6404b434d953bcdfe2ed";

const BUCKET = "image-storage-original";
const ORIGIN = `https://${BUCKET}.s3.ap-south-1.amazonaws.com`;
const PRESIGNED = `${ORIGIN}/free-projects/house-1/e967e0d6-b8d4-4463-9bd4-9f3d188add16.png?${SIG}`;

/** The module under test, imported fresh with the bucket configured. */
async function configured() {
  vi.resetModules();
  vi.stubEnv("S3_BUCKET_NAME", BUCKET);
  vi.stubEnv("S3_REGION", "ap-south-1");
  return import("../media-proxy");
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("resolveProxyTarget", () => {
  it("accepts the presigned URL the backend actually hands out", async () => {
    const { resolveProxyTarget } = await configured();

    // Verbatim from the CORS failure this route exists to work around.
    const target = resolveProxyTarget(PRESIGNED);

    expect(target).not.toBeNull();
    expect(new URL(target!).origin).toBe(ORIGIN);
    expect(new URL(target!).pathname).toBe("/free-projects/house-1/e967e0d6-b8d4-4463-9bd4-9f3d188add16.png");
    expect(new URL(target!).searchParams.get("X-Amz-Signature")).toBe(
      "0c3ee1c01ff94385ef9d9e78b36cc4a28112588942fd6404b434d953bcdfe2ed",
    );
  });

  it("refuses every host that is not the configured bucket", async () => {
    const { resolveProxyTarget } = await configured();

    for (const url of [
      // Another bucket in our region — correctly signed, by someone else.
      `https://someone-elses.s3.ap-south-1.amazonaws.com/a.png?${SIG}`,
      // Another region, another AWS service, a plain third party.
      `https://${BUCKET}.s3.us-east-1.amazonaws.com/a.png?${SIG}`,
      `https://${BUCKET}.s3-control.ap-south-1.amazonaws.com/a.png?${SIG}`,
      `https://evil.example.com/a.png?${SIG}`,
      // The classic SSRF targets.
      `http://169.254.169.254/latest/meta-data/?${SIG}`,
      `http://127.0.0.1:8080/a.png?${SIG}`,
      `file:///etc/passwd?${SIG}`,
      // A scheme downgrade on the right host, and a host merely ENDING with it.
      `http://${BUCKET}.s3.ap-south-1.amazonaws.com/a.png?${SIG}`,
      `https://${BUCKET}.s3.ap-south-1.amazonaws.com.evil.example/a.png?${SIG}`,
      // Credentials in the authority, which some parsers read as a host.
      `https://${BUCKET}.s3.ap-south-1.amazonaws.com@evil.example/a.png?${SIG}`,
      // Right host, wrong port.
      `https://${BUCKET}.s3.ap-south-1.amazonaws.com:8080/a.png?${SIG}`,
    ]) {
      expect(resolveProxyTarget(url), url).toBeNull();
    }
  });

  it("refuses an unsigned URL", async () => {
    const { resolveProxyTarget } = await configured();

    // Without a signature the caller is naming an object rather than presenting a
    // capability, which would make this a relay for the whole bucket.
    expect(resolveProxyTarget(`${ORIGIN}/free-projects/house-1/a.png`)).toBeNull();
    expect(resolveProxyTarget(`${ORIGIN}/a.png?X-Amz-Date=20260816T120347Z`)).toBeNull();
  });

  it("refuses a path that is not a plain storage key", async () => {
    const { resolveProxyTarget } = await configured();

    expect(resolveProxyTarget(`${ORIGIN}/a%00.png?${SIG}`)).toBeNull();
    expect(resolveProxyTarget(`${ORIGIN}/a.png;@evil.example/?${SIG}`)).toBeNull();
    expect(resolveProxyTarget(`${ORIGIN}/?${SIG}`)).toBeNull();
  });

  it("cannot be walked out of the bucket with a traversal", async () => {
    const { resolveProxyTarget } = await configured();

    // `URL` normalises the dot segments away before we ever see them, so this is
    // not rejected — it is simply confined. What matters is where it ends up: a
    // key inside our own bucket, which S3 will refuse anyway because the
    // signature was minted for a different one.
    const target = resolveProxyTarget(`${ORIGIN}/../../etc/passwd?${SIG}`);

    expect(new URL(target!).origin).toBe(ORIGIN);
    expect(new URL(target!).pathname).toBe("/etc/passwd");
  });

  it("refuses query parameters outside the signing set, and malformed ones inside it", async () => {
    const { resolveProxyTarget } = await configured();

    // An extra parameter is not passed through — it is grounds for refusal, so
    // nothing unreviewed can ever reach S3.
    expect(resolveProxyTarget(`${ORIGIN}/a.png?${SIG}&response-content-disposition=attachment`)).toBeNull();
    // A signature that is not a SigV4 signature.
    expect(resolveProxyTarget(`${ORIGIN}/a.png?${SIG.replace(/X-Amz-Signature=[a-f0-9]+/, "X-Amz-Signature=../x")}`))
      .toBeNull();
  });

  it("refuses a missing or unparseable url parameter", async () => {
    const { resolveProxyTarget } = await configured();

    expect(resolveProxyTarget(null)).toBeNull();
    expect(resolveProxyTarget("")).toBeNull();
    expect(resolveProxyTarget("not a url")).toBeNull();
    expect(resolveProxyTarget("/a/relative/path.png")).toBeNull();
  });

  it("stays off when no bucket is configured, rather than widening what it accepts", async () => {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", "");
    const { MEDIA_ORIGIN, resolveProxyTarget } = await import("../media-proxy");

    expect(MEDIA_ORIGIN).toBeNull();
    expect(resolveProxyTarget(PRESIGNED)).toBeNull();
  });

  it("refuses a malformed bucket or region rather than interpolating it into a host", async () => {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", "bucket/../../evil.example");
    const bad = await import("../media-proxy");
    expect(bad.MEDIA_ORIGIN).toBeNull();

    vi.resetModules();
    vi.stubEnv("S3_BUCKET_NAME", BUCKET);
    vi.stubEnv("S3_REGION", "ap-south-1.evil.example");
    const badRegion = await import("../media-proxy");
    expect(badRegion.MEDIA_ORIGIN).toBeNull();
  });
});
