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
 *   - The ORIGIN is ours, assembled here from a bucket name and a region that came
 *     from this container's environment or, failing that, from the API itself —
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

import { config } from "./config";

/**
 * The origin built from a bucket and a region, or null if either is not a name AWS
 * would accept.
 *
 * Both halves are checked against their own naming rules before being interpolated,
 * so neither a malformed environment nor a malformed answer from the API can smuggle
 * a path, a port or a second host into the origin this module vouches for.
 */
export function buildMediaOrigin(
  bucket: string | null | undefined,
  region: string | null | undefined,
): string | null {
  const b = (bucket || "").trim().toLowerCase();
  const r = (region || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(b)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(r)) return null;
  return `https://${b}.s3.${r}.amazonaws.com`;
}

/**
 * The origin named by this container's own environment, or null when it says nothing.
 *
 * This is the fast path and the one an operator can force. It is deliberately not a
 * "fall back to any bucket in the region" — that would put the hostname back under
 * the caller's influence, which is the whole thing this module exists to prevent.
 */
export function envMediaOrigin(): string | null {
  return buildMediaOrigin(process.env.S3_BUCKET_NAME, process.env.S3_REGION || "ap-south-1");
}

/** How long we wait on S3 before giving up on one image. */
export const MEDIA_PROXY_TIMEOUT_MS = 20_000;

/** How long we wait on the API when asking it where its images live. */
const DISCOVERY_TIMEOUT_MS = 5_000;

/** How long a discovered answer is trusted before we ask again. */
const DISCOVERY_TTL_MS = 10 * 60_000;

/**
 * How long a failure is remembered.
 *
 * Short, because the usual cause is the API still starting up, and long enough that a
 * page opening twelve images does not make twelve doomed calls to find that out.
 */
const DISCOVERY_RETRY_MS = 30_000;

let discovered: { origin: string | null; until: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/**
 * Ask the API which bucket it presigns from, and build the origin from the parts.
 *
 * <p><b>Why this exists.</b> The environment variable above is the whole configuration
 * this route ever had, and in production it was never set: nothing about the web
 * container suggests it needs the name of the API's S3 bucket, and the value is only
 * read by a fallback that is silent when it works. So the route answered
 * `503 Media proxy is not configured` for every image, `loadCrossOriginImage` had
 * nowhere to fall back to when S3 refused the CORS load, and a customer pressing
 * "Download as PDF" on a picture they were looking at was told their device could not
 * read it.
 *
 * <p>A setting that has to be copied into a second deployment to work is a setting
 * that will be missing from one of them. The API already knows the answer — it is the
 * same property it presigns with — so it is asked rather than duplicated.
 *
 * <p>This does not loosen what the proxy will connect to. The response supplies a
 * bucket NAME and a region, both re-validated here, and the origin is assembled from
 * them locally; a URL in the response body would be ignored. The reply comes from the
 * API over the server-to-server origin this app is configured with, never from the
 * browser request being served.
 */
async function discoverMediaOrigin(): Promise<string | null> {
  try {
    const res = await fetch(`${config.internalApiOrigin}/api/images/storage`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return null;
    const { bucket, region } = body as { bucket?: unknown; region?: unknown };
    if (typeof bucket !== "string" || typeof region !== "string") return null;
    return buildMediaOrigin(bucket, region);
  } catch {
    // An API that is down, slow or older than this endpoint. Nothing to serve from,
    // and nothing worth logging per image — the route says it once.
    return null;
  }
}

/**
 * The one origin this proxy will fetch from, or null when there is nothing to serve.
 *
 * Null disables the route for as long as it stays null; it never widens into
 * "whatever the caller asked for".
 *
 * Concurrent callers share one in-flight lookup, so a gallery opening twenty images
 * against a cold server asks the API once rather than twenty times.
 */
export async function mediaOrigin(): Promise<string | null> {
  const fromEnv = envMediaOrigin();
  if (fromEnv) return fromEnv;

  const now = Date.now();
  if (discovered && discovered.until > now) return discovered.origin;
  if (inFlight) return inFlight;

  inFlight = discoverMediaOrigin()
    .then((origin) => {
      discovered = {
        origin,
        until: Date.now() + (origin ? DISCOVERY_TTL_MS : DISCOVERY_RETRY_MS),
      };
      return origin;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Test seam — the module-level memo would otherwise leak between cases. */
export function __resetMediaOriginCache() {
  discovered = null;
  inFlight = null;
}

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
 * The returned string is assembled here from `origin` plus parts that have each been
 * validated — the caller's own URL string is never forwarded.
 *
 * `origin` is a parameter rather than a module constant because resolving it can mean
 * asking the API (see {@link mediaOrigin}), and because a pure function is the honest
 * shape for the security boundary these tests exercise.
 *
 * Returns null rather than throwing so the route can answer 400 without telling an
 * unknown caller which of the rules they broke.
 */
export function resolveProxyTarget(raw: string | null, origin: string | null): string | null {
  if (!origin || !raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // One host, fixed above. Anything else — another bucket, another service, a
  // link-local address, a look-alike domain — stops here.
  if (parsed.origin.toLowerCase() !== origin) return null;

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

  return `${origin}${path}?${query.toString()}`;
}
