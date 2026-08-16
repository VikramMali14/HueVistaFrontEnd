/**
 * Loading an image the canvas is allowed to read.
 *
 * Every screen that recolours a room — the studio, the render studio, the mask
 * tools, the PDF export, the public share page — draws its photo and masks onto a
 * canvas and then reads pixels back out. That requires the image to be loaded
 * `crossOrigin="anonymous"`, and each of those screens had grown its own four-line
 * `loadImage()` that did exactly that and nothing else.
 *
 * Which meant they also shared a failure. The backend stores images in S3 and hands
 * out presigned URLs, and a presigned GET is only *fetchable* — it says nothing
 * about CORS. Unless the bucket itself carries a CORS rule naming this site, the
 * browser refuses the response ("No 'Access-Control-Allow-Origin' header is present
 * on the requested resource") and the load fails outright. A shared room opened from
 * a WhatsApp link showed an empty frame, because its base photo lives in the shared
 * free-project library on S3 and was blocked before a single pixel arrived.
 *
 * The fix is to stop depending on a bucket setting that this codebase cannot
 * guarantee: on failure, fetch the same bytes back through our own origin, where
 * CORS does not apply and the canvas stays untainted. The direct load is still tried
 * first — when the bucket IS configured (the backend installs the rule at startup
 * where its IAM role permits) the image comes straight from S3 and no byte crosses
 * this server, which is the reason presigned URLs are used at all.
 */

import { mediaProxyUrl } from "./media";

/**
 * Hosts that have already refused a CORS load in this page's lifetime.
 *
 * Without this, a room with six masks pays six blocked requests before six proxied
 * ones. The first failure is enough to know the answer for the rest — the bucket
 * either has a rule or it doesn't, and it will not change mid-session. Deliberately
 * not persisted: a reload should re-check, so that installing the bucket rule takes
 * effect without anyone clearing storage.
 */
const hostsRefusingCors = new Set<string>();

/**
 * The host to blame if `url` fails, or null when a proxy retry could not help —
 * same-origin URLs, `data:`/`blob:` URLs, and anything unparseable. For those the
 * original error is the real one and should surface unchanged.
 */
function crossOriginHost(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin === window.location.origin ? null : u.host;
  } catch {
    return null;
  }
}

function loadDirect(src: string, original: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${original}`));
    img.src = src;
  });
}

/**
 * Load `url` into an `HTMLImageElement` a canvas may read from.
 *
 * Rejects only when both the direct load and the same-origin retry fail, so a
 * genuinely missing or expired image still reports itself as one.
 */
export async function loadCrossOriginImage(url: string): Promise<HTMLImageElement> {
  const host = crossOriginHost(url);
  if (host && hostsRefusingCors.has(host)) {
    return loadDirect(mediaProxyUrl(url), url);
  }
  try {
    return await loadDirect(url, url);
  } catch (err) {
    if (!host) throw err;
    hostsRefusingCors.add(host);
    return loadDirect(mediaProxyUrl(url), url);
  }
}

/** Test seam — the module-level cache would otherwise leak between cases. */
export function __resetCorsMemo() {
  hostsRefusingCors.clear();
}
