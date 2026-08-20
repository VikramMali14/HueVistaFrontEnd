/**
 * Saving a stored image to the customer's device — actually saving it.
 *
 * <p><b>The bug this replaces.</b> Every "download the image" button was an anchor with
 * a `download` attribute pointing at the presigned S3 URL. The attribute is
 * same-origin-only by specification: on a cross-origin href the browser ignores it and
 * NAVIGATES instead. So the button did not download anything. It replaced the page with
 * a bare JPEG — on a phone, with no back affordance in sight — and if the customer then
 * used their browser's own save, the file landed in their downloads folder named after
 * the storage key: `ad289bfc-4ba5-460b-a903-012d64a611e6.jpg`. A month later, nothing
 * about that file says which room it is.
 *
 * <p>Fetching the bytes and handing over a blob fixes both halves at once: it is a real
 * download, and the name is ours to choose.
 *
 * <p><b>Why the proxy is tried first here.</b> `loadCrossOriginImage` tries S3 directly
 * and only falls back to `/api/media`, because it is loading a dozen masks at a time and
 * bytes that skip our server are the entire reason the backend presigns. A download is
 * one request, made because a person pressed a button — the saving is worth more than
 * the bandwidth. Going same-origin first also keeps a blocked CORS fetch out of the
 * console on deployments whose bucket carries no rule, which is most of the reason
 * anyone reads that console.
 */

import { downloadBlob } from "./download-blob";
import { mediaProxyUrl } from "./media";

/** Give up rather than leave a button spinning on a stalled network. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Save `url` as `basename` + the right extension, and say whether that worked.
 *
 * Returns false rather than throwing when nothing could be fetched — an expired
 * signature, an offline phone, a proxy that is not configured — so the caller can fall
 * back to opening the picture, which is the old behaviour and still better than a
 * button that does nothing.
 */
export async function downloadRemoteImage(url: string, basename: string): Promise<boolean> {
  if (!url) return false;

  const sameOrigin = isSameOrigin(url);
  // A same-origin URL (the BFF's own image route) needs no proxy and must carry the
  // session cookie; anything else goes through the passthrough, then direct.
  const attempts = sameOrigin ? [url] : [mediaProxyUrl(url), url];

  for (const attempt of attempts) {
    const blob = await fetchBlob(attempt);
    if (!blob) continue;
    downloadBlob(blob, `${basename}${extensionFor(blob.type, url)}`);
    return true;
  }
  return false;
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, {
      credentials: isSameOrigin(url) ? "same-origin" : "omit",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    // A 200 that is not an image is an error page — saving it as a .jpg would hand the
    // customer a file their gallery refuses to open.
    return blob.size > 0 && blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

function isSameOrigin(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * The extension to save under: the served content type first, then whatever the storage
 * key ends in, and `.jpg` when neither says anything. The stored render may be a PNG,
 * so this is not a constant.
 */
function extensionFor(contentType: string, url: string): string {
  const byType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
  };
  const known = byType[contentType.split(";")[0]!.trim().toLowerCase()];
  if (known) return known;
  const fromPath = /\.(jpe?g|png|webp|avif)(?:$|\?)/i.exec(url)?.[1];
  return fromPath ? `.${fromPath.toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
}
