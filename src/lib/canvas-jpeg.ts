/**
 * Canvas → JPEG data URL helpers.
 *
 * These live apart from `pdf-export` (their first caller) for a load-time reason.
 * The studio needs them SYNCHRONOUSLY on paths that have nothing to do with a PDF —
 * maximising the room, snapshotting it for the share sheet, the plain "download this
 * image" button — while the PDF generator beside them is ~500 lines the studio only
 * ever runs when someone actually asks for a colour board. Sharing one module meant
 * importing one to import the other, so every studio visit paid for the generator up
 * front. Split, the board can be fetched on the click that needs it and these stay
 * where their callers can use them without awaiting anything.
 *
 * `pdf-export` re-exports both, so existing importers are unaffected.
 */

import { loadCrossOriginImage } from "./load-image";

/**
 * Render the recoloured `source` canvas to a JPEG data URL, downscaled so its
 * longest edge is at most `maxEdge` px. The studio canvas is the stored image's own
 * size × devicePixelRatio — a ~2K canvas on a retina screen is already ~4096px — so a
 * raw PNG export is many megabytes; a bounded JPEG keeps both the single-image
 * download and the PDF small. Returns "" if a 2D context or the source dimensions
 * aren't available.
 *
 * Only ever DOWNSCALES: the scale is clamped at 1, so a source smaller than `maxEdge`
 * passes through at its own size rather than being interpolated up to the cap. That is
 * deliberate — `maxEdge` is a ceiling on file size, not a target resolution, and
 * inventing pixels to reach it would add bytes and no detail.
 */
export function canvasToJpegDataUrl(
  source: HTMLCanvasElement,
  maxEdge = 1600,
  quality = 0.85,
): string {
  const sw = source.width;
  const sh = source.height;
  if (sw <= 0 || sh <= 0) return "";
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  // White matte behind the photo so any (there shouldn't be) transparency in the
  // canvas never bleeds to black inside the JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return out.toDataURL("image/jpeg", quality);
}

/**
 * Load an already-stored image (the AI render) and re-encode it as a bounded JPEG
 * data URL, so it can be embedded in a board the same way a canvas snapshot is.
 *
 * Resolves to "" rather than rejecting on every failure path there is — the image
 * 404s, the fetch is blocked, or the canvas comes back tainted because the host
 * served no CORS header and `toDataURL` throws. The board is the customer's
 * deliverable and a missing closing page is a smaller board; a thrown error here
 * would cost them the whole thing.
 *
 * The load goes through `loadCrossOriginImage` for the same reason the studio's
 * does: an S3 presigned URL is blocked outright when the bucket carries no CORS
 * rule, and this used to be one of the ways that showed up — a colour board whose
 * closing AI render was simply missing, with nothing anywhere saying why.
 */
export async function imageUrlToJpegDataUrl(
  url: string,
  maxEdge = 1500,
  quality = 0.85,
): Promise<string> {
  if (!url) return "";
  let img: HTMLImageElement;
  try {
    img = await loadCrossOriginImage(url);
  } catch {
    return "";
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return "";
  }
}
