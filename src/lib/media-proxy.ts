/**
 * Which remote media URLs `/api/media` will fetch on the browser's behalf.
 *
 * The proxy exists because a canvas needs PIXELS, not just a picture. Every image
 * the studio and the share page draw is loaded with `crossOrigin="anonymous"`, so
 * that `toDataURL()` / `readPixels()` keep working — and that attribute turns an
 * ordinary image load into a CORS request. S3 answers a presigned GET happily but
 * sends no `Access-Control-Allow-Origin` unless the BUCKET carries a CORS rule, so
 * the browser blocks the response and the room never renders. Fetching the same
 * bytes through this origin sidesteps the question entirely: same-origin images
 * need no CORS header and taint no canvas.
 *
 * That makes this a server-side fetcher driven by a query parameter, which is an
 * SSRF hole unless the target is pinned. So it is pinned twice:
 *
 *   1. The HOST must be S3 in the region we store in — the same rule the CSP's
 *      `img-src` uses in `next.config.ts`, kept deliberately in step with it.
 *   2. The URL must be PRESIGNED. An unsigned URL is one anybody could have
 *      written; a signed one was minted by the backend and expires within the
 *      hour, which is what stops this being a general-purpose relay for every
 *      public object in the region.
 *
 * Nothing here grants access that the caller did not already hold: a presigned URL
 * is itself the capability, and the browser could fetch it directly if only the
 * bucket said so.
 */

/** Matches `next.config.ts` — the region the backend's `app.s3.region` names. */
const S3_REGION = (process.env.S3_REGION || "ap-south-1").trim();

/**
 * Optional second pin: the one bucket we store in.
 *
 * The region rule alone would also accept a presigned URL for somebody else's
 * bucket in the same region — bucket names are global, so anyone can make one.
 * The damage is bounded (the response must be an image, and is served `nosniff`),
 * but it would still be our bandwidth carrying their bytes. Setting
 * `S3_BUCKET_NAME` to the same value the backend uses closes that off; leaving it
 * unset keeps the region-wide behaviour the CSP already allows.
 */
const S3_BUCKET = (process.env.S3_BUCKET_NAME || "").trim();

/** How long we wait on S3 before giving up on one image. */
export const MEDIA_PROXY_TIMEOUT_MS = 20_000;

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The S3 hostnames we will fetch from.
 *
 * Both addressing styles are accepted because the SDK has used both over the
 * years: virtual-hosted (`<bucket>.s3.<region>.amazonaws.com`, what the presigner
 * emits today) and path-style (`s3.<region>.amazonaws.com/<bucket>/…`). Bucket
 * names may themselves contain dots, hence the permissive leading label.
 *
 * The region is pinned rather than wildcarded: `s3.<anything>.amazonaws.com` would
 * also match other AWS services that live under that domain, and there is no
 * reason for this app to read a bucket it does not store in.
 */
function s3HostPattern(region: string): RegExp {
  const r = escapeForRegExp(region);
  // `s3-<region>` is the pre-2019 form; still valid, still served.
  return new RegExp(`^(?:[a-z0-9][a-z0-9.-]*\\.)?s3[.-]${r}\\.amazonaws\\.com$`, "i");
}

/**
 * The bucket an S3 URL addresses, under either addressing style.
 *
 * Returns "" when it cannot be told — a path-style URL with no path, say — which
 * the bucket pin then treats as a mismatch rather than a pass.
 */
function bucketOf(url: URL, region: string): string {
  const host = url.hostname.toLowerCase();
  const suffixMatch = host.match(new RegExp(`^(.*)\\.s3[.-]${escapeForRegExp(region)}\\.amazonaws\\.com$`, "i"));
  if (suffixMatch) return suffixMatch[1] ?? "";
  return url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
}

/** True when `url` is an S3 URL in our region that carries a SigV4 signature. */
export function isProxyableMediaUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (!s3HostPattern(S3_REGION).test(url.hostname)) return false;
  if (S3_BUCKET && bucketOf(url, S3_REGION) !== S3_BUCKET.toLowerCase()) return false;
  // Presigned only — see the note above on why an unsigned URL is refused.
  return url.searchParams.has("X-Amz-Signature");
}

/**
 * The URL `/api/media` should fetch, or null when the request must be refused.
 *
 * Returns null rather than throwing so the route can answer 400 without having to
 * tell an unknown caller which of the rules they broke.
 */
export function resolveProxyTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return isProxyableMediaUrl(url) ? url : null;
}
