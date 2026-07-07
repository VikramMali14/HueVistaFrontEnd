/**
 * Shared image-upload rules and helpers. Every place that accepts a photo —
 * the colour finder, the fabric palette, the visualizer, the phone hand-off —
 * validates and decodes through here, so the accepted types, size caps and
 * error wording stay identical across the app.
 */

export const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Value for `<input type="file" accept=…>` — mirrors ALLOWED_IMAGE_MIME. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** iPhones default to HEIC, which browsers can't decode — worth a specific hint. */
export function isHeicImage(file: { type: string; name?: string }): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

/**
 * Validate a picked file. Returns a user-facing error message, or null when
 * the file is acceptable. `maxBytes` adds a size cap on top of the type check.
 */
export function imageFileError(file: File, opts: { maxBytes?: number } = {}): string | null {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return isHeicImage(file)
      ? "iPhone HEIC photos aren't supported yet — set Camera to “Most Compatible”, or use a JPEG/PNG."
      : "Only JPEG, PNG or WebP photos are accepted.";
  }
  if (opts.maxBytes != null && file.size > opts.maxBytes) {
    return `Photo is larger than ${Math.round(opts.maxBytes / (1024 * 1024))} MB. Use a smaller copy.`;
  }
  return null;
}

/**
 * Decode a file into an HTMLImageElement via an object URL. The URL is revoked
 * as soon as the image settles, with a 15s fallback so it can never leak if
 * the element never fires load/error.
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    let revoked = false;
    const revoke = () => {
      if (!revoked) {
        revoked = true;
        URL.revokeObjectURL(url);
      }
    };
    const img = new Image();
    img.onload = () => {
      revoke();
      resolve(img);
    };
    img.onerror = () => {
      revoke();
      reject(new Error("Could not read that image. Try another photo."));
    };
    img.src = url;
    setTimeout(revoke, 15000);
  });
}

/** Dimensions for drawing `img` no larger than `maxDim` on its longest side. */
export function scaleToFit(
  img: { naturalWidth: number; naturalHeight: number },
  maxDim: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  return {
    width: Math.max(1, Math.round(img.naturalWidth * scale)),
    height: Math.max(1, Math.round(img.naturalHeight * scale)),
  };
}

/**
 * Draw an image scaled down to `maxDim` onto an offscreen canvas and return a
 * readable 2D context (null when the browser can't create one). For palette
 * extraction and other pixel reads that don't need the canvas on screen.
 */
export function drawScaledCanvas(
  img: HTMLImageElement,
  maxDim: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const { width, height } = scaleToFit(img, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}
