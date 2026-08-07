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

// ─── Cropping and re-encoding, so a size limit is never something to hit ─────

/** A crop in SOURCE-image pixels: what part of the original to keep. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EncodeOptions {
  /** Longest side of the result, in pixels. */
  maxDim?: number;
  /** Hard ceiling for the encoded file. Quality is stepped down to meet it. */
  maxBytes?: number;
  /** Output type. PNG is never used — it cannot be traded against quality. */
  type?: "image/jpeg" | "image/webp";
  /** Filename for the produced File; the extension is corrected to match `type`. */
  filename?: string;
}

/**
 * The largest rectangle of `aspect` that fits inside a `width`×`height` image,
 * centred — the default crop, and the same framing `object-fit: cover` produces.
 *
 * Centred because it is the only choice that needs no knowledge of the subject.
 * The cropper lets it be dragged from there; this is where it starts.
 */
export function centredCrop(width: number, height: number, aspect: number): CropRect {
  const current = width / height;
  if (current > aspect) {
    // Too wide: full height, trim the sides.
    const w = Math.round(height * aspect);
    return { x: Math.round((width - w) / 2), y: 0, width: w, height };
  }
  const h = Math.round(width / aspect);
  return { x: 0, y: Math.round((height - h) / 2), width, height: h };
}

/** Clamp a crop back inside the image, keeping its size where possible. */
export function clampCrop(crop: CropRect, width: number, height: number): CropRect {
  const w = Math.min(crop.width, width);
  const h = Math.min(crop.height, height);
  return {
    width: w,
    height: h,
    x: Math.min(Math.max(0, crop.x), width - w),
    y: Math.min(Math.max(0, crop.y), height - h),
  };
}

/** Promise form of canvas.toBlob, which has no promise API of its own. */
function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Cut `crop` out of `img`, scale it to fit `maxDim`, and encode it under
 * `maxBytes`.
 *
 * This is what stops "that image is too big" from ever being the user's problem.
 * A photo off a modern phone is 4–12 MB and 4000px wide; the slot it is going
 * into is drawn a few hundred pixels across and the server refuses anything over
 * 8 MB. Every one of those rejections was a person being asked to go and find
 * image-editing software to do something the browser can do in a few hundred
 * milliseconds — so it is done here, before the upload, rather than reported
 * afterwards.
 *
 * Quality is stepped down rather than guessed at once: the relationship between
 * JPEG quality and file size depends entirely on the picture (a flat wall
 * compresses to nothing, a bookshelf does not), so the only reliable way to land
 * under a byte budget is to encode and look. Five attempts from 0.9 down to 0.5
 * cover the range; below that the artefacts would be visible on a colour
 * photograph, so the last attempt is returned whatever its size and the caller's
 * own validation gets the final word.
 */
export async function cropAndEncode(
  img: HTMLImageElement,
  crop: CropRect,
  { maxDim = 2400, maxBytes, type = "image/jpeg", filename = "image.jpg" }: EncodeOptions = {},
): Promise<File> {
  const source = clampCrop(crop, img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the image. Try another browser.");
  // The result is a photograph being downscaled, where the browser's smoothing is
  // the difference between a clean image and an aliased one.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, source.x, source.y, source.width, source.height, 0, 0, width, height);

  const qualities = [0.9, 0.82, 0.72, 0.62, 0.5];
  let encoded: Blob | null = null;
  for (const quality of qualities) {
    encoded = await toBlob(canvas, type, quality);
    if (!encoded) break;
    if (maxBytes == null || encoded.size <= maxBytes) break;
  }
  if (!encoded) throw new Error("Could not prepare the image on this device.");

  return new File([encoded], withExtension(filename, type), {
    type,
    lastModified: Date.now(),
  });
}

/** Swap a filename's extension for the one matching `type`. */
function withExtension(filename: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : "jpg";
  const base = filename.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${ext}`;
}
