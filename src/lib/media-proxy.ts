/**
 * What `/api/media` is allowed to fetch.
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
 * A server that fetches a URL supplied by whoever called it is the shape of every
 * SSRF hole ever written, so the caller supplies as little of that URL as possible:
 *
 *   - The ORIGIN is ours, built here from `S3_BUCKET_NAME` and `S3_REGION` and
 *     never from the request. There is exactly one host this route will ever
 *     connect to, and no input can move it. An origin that does not match is
 *     refused rather than followed.
 *   - The PATH must look like a storage key and nothing else: no host, no port, no
 *     `..`, and only the characters an S3 key of ours actually uses.
 *   - The QUERY is rebuilt from scratch out of the SigV4 parameters, each checked
 *     against its own shape. Nothing else survives.
 *   - The signature must be PRESENT. An unsigned URL is one anybody could have
 *     written; a signed one was minted by the backend and expires within the hour,
 *     which is what stops this being a relay for the whole bucket.
 *
 * Nothing here grants access the caller did not already hold: a presigned URL is
 * itself the capability, and the browser could fetch it directly if only the bucket
 * said so.
 */

/**
 * The one origin this proxy fetches from, or null when it has not been configured.
 *
 * Null disables the route. It is deliberately not a "fall back to any bucket in the
 * region" — that would put the hostname back under the caller's influence, which is
 * the whole thing this module exists to prevent. A deployment that wants the
 * fallback sets `S3_BUCKET_NAME` to the same value the backend uses; one that does
 * not gets its images straight from S3 once the bucket's CORS rule is in place,
 * which is the better outcome anyway.
 */
export const MEDIA_ORIGIN: string | null = buildMediaOrigin();

function buildMediaOrigin(): string | null {
  const bucket = (process.env.S3_BUCKET_NAME || "").trim().toLowerCase();
  const region = (process.env.S3_REGION || "ap-south-1").trim().toLowerCase();
  // Both are checked against their own naming rules before being interpolated, so
  // a malformed environment cannot smuggle a path or a second host into the origin.
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(region)) return null;
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

/** How long we wait on S3 before giving up on one image. */
export const MEDIA_PROXY_TIMEOUT_MS = 20_000;

/**
 * The characters an object key of ours uses, and only those: UUIDs, the
 * `free-projects/<slug>/` library prefix, and a file extension.
 *
 * Percent-escapes are refused rather than decoded. No key this application writes
 * needs one, so allowing them would only widen what has to be reasoned about — and
 * `%00` sailing through an escape allowance is exactly the kind of thing that then
 * has to be reasoned about.
 */
const SAFE_KEY_PATH = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;

/** The SigV4 query parameters a presigned GET carries, and the shape of each. */
const SIGNING_PARAMS: Record<string, RegExp> = {
  "X-Amz-Algorithm": /^[A-Za-z0-9-]{1,32}$/,
  "X-Amz-Credential": /^[A-Za-z0-9/_-]{1,128}$/,
  "X-Amz-Date": /^[0-9]{8}T[0-9]{6}Z$/,
  "X-Amz-Expires": /^[0-9]{1,7}$/,
  "X-Amz-SignedHeaders": /^[a-z0-9;-]{1,128}$/,
  "X-Amz-Signature": /^[a-f0-9]{64}$/,
  // Present only when the backend runs on temporary credentials (an IAM role).
  "X-Amz-Security-Token": /^[A-Za-z0-9+/=_-]{1,4096}$/,
};

/**
 * The URL `/api/media` should fetch, or null when the request must be refused.
 *
 * The returned string is assembled here from {@link MEDIA_ORIGIN} plus parts that
 * have each been validated — the caller's own URL string is never forwarded.
 *
 * Returns null rather than throwing so the route can answer 400 without telling an
 * unknown caller which of the rules they broke.
 */
export function resolveProxyTarget(raw: string | null): string | null {
  if (!MEDIA_ORIGIN || !raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // One host, fixed above. Anything else — another bucket, another service, a
  // link-local address, a look-alike domain — stops here.
  if (parsed.origin.toLowerCase() !== MEDIA_ORIGIN) return null;

  // `URL` has already normalised any dot segments, and they could not have escaped
  // the origin in any case — this only keeps a literal `..` out of a key we build.
  const path = parsed.pathname;
  if (!SAFE_KEY_PATH.test(path) || path.includes("..")) return null;

  // Rebuilt, not copied: only known parameters, each matching its own shape, and
  // re-encoded by URLSearchParams rather than passed through as written.
  const query = new URLSearchParams();
  for (const [name, value] of parsed.searchParams) {
    const shape = SIGNING_PARAMS[name];
    if (!shape || !shape.test(value)) return null;
    query.set(name, value);
  }
  if (!query.has("X-Amz-Signature")) return null;

  return `${MEDIA_ORIGIN}${path}?${query.toString()}`;
}
