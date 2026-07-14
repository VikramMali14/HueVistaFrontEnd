/**
 * Inward ("choked") mask-edge feathering, shared by both recolor engines.
 *
 * The obvious way to soften a mask edge — a plain Gaussian blur — spreads
 * coverage SYMMETRICALLY: half of the softened ramp lands OUTSIDE the region,
 * so paint bleeds past the wall boundary onto the sky, window frames and the
 * thin gaps between railing bars, while the original wall glows through the
 * half-transparent inner half of the ramp. Users saw that as a bright halo
 * around every recoloured edge.
 *
 * This module feathers INWARD instead:
 *
 *   1. blur the mask's coverage (a separable box blur run twice ≈ Gaussian,
 *      with the sampling window clamped to the image so regions touching the
 *      photo border don't erode);
 *   2. re-steepen ("choke") the blurred ramp with a smoothstep remap, so the
 *      fade starts near the true boundary and reaches full paint a few pixels
 *      inside it; and
 *   3. clamp the result by the ORIGINAL hard coverage, so every pixel outside
 *      the region — sky, frames, railing gaps — stays at exactly zero.
 *
 * The painted region keeps crisp mode's exact outline, but the colour fades in
 * over the feather radius instead of switching on in one pixel — and nothing
 * ever spills past the boundary. The pixel math lives in pure functions over
 * coverage arrays (0..1 floats) so it is unit-testable without a canvas.
 */

/** Blurred-coverage level where the inward fade starts. At a straight edge the
 *  blur reads 0.5 exactly ON the boundary, so a start below 0.5 keeps the fade
 *  anchored at the boundary (paint still reaches the edge, just softly) while
 *  the hard-mask clamp guarantees zero coverage beyond it. */
const RAMP_LO = 0.3;
/** Blurred-coverage level where the fade reaches full paint — hit a fraction
 *  of a radius inside the region, so the softness stays a tight edge treatment
 *  rather than a wide translucent band. */
const RAMP_HI = 0.85;

/** One horizontal box-blur pass with the window clamped to the row (window
 *  average over the pixels that exist), so coverage at the image border is
 *  not diluted by imaginary transparent pixels outside it. */
function boxPassH(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  const pre = new Float32Array(w + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x]! + src[row + x]!;
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      out[row + x] = (pre[hi + 1]! - pre[lo]!) / (hi - lo + 1);
    }
  }
  return out;
}

/** The vertical counterpart of {@link boxPassH}. */
function boxPassV(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  const pre = new Float32Array(h + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y]! + src[y * w + x]!;
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      out[y * w + x] = (pre[hi + 1]! - pre[lo]!) / (hi - lo + 1);
    }
  }
  return out;
}

/** One full box-blur pass (horizontal + vertical) over a 0..1 coverage field,
 *  window clamped to the image. Shared with the edge-snap refinement
 *  (mask-refine.ts), whose guided filter is built from box means. */
export function boxBlurField(src: Float32Array, w: number, h: number, r: number): Float32Array {
  return boxPassV(boxPassH(src, w, h, r), w, h, r);
}

/**
 * Blur a coverage field (0..1 per pixel) by ~`radius` px: two separable box
 * passes, whose composition approximates a Gaussian well enough for a
 * few-pixel edge feather. Pure and deterministic — no canvas `filter`
 * dependency, so the fallback engine feathers identically on browsers
 * without CanvasRenderingContext2D.filter support.
 */
export function blurCoverage(cov: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  return boxBlurField(boxBlurField(cov, w, h, r), w, h, r);
}

/**
 * Combine hard and blurred coverage into the inward feather: smoothstep the
 * blurred ramp from RAMP_LO..RAMP_HI (re-steepening it so full paint arrives
 * just inside the edge), then clamp by the hard mask so no coverage ever
 * escapes the original region.
 */
export function chokeInward(hard: Float32Array, soft: Float32Array): Float32Array {
  const out = new Float32Array(hard.length);
  for (let i = 0; i < hard.length; i++) {
    let t = (soft[i]! - RAMP_LO) / (RAMP_HI - RAMP_LO);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = t * t * (3 - 2 * t);
    const hd = hard[i]!;
    out[i] = s < hd ? s : hd;
  }
  return out;
}

/**
 * Shift a coverage field's boundary by `offsetPx` (positive = expand the
 * region outward, negative = contract it inward) with an anti-aliased edge.
 * A single clamped box blur turns the hard edge into a linear ramp whose
 * level sets sit at known distances from the boundary; cutting the ramp at a
 * shifted threshold moves the edge by the requested amount, and a narrow
 * smoothstep window around the cut keeps ~1px of AA instead of re-aliasing.
 * This is the studio's "edge nudge": a uniform grow/shrink for masks that sit
 * consistently inside or outside the real surface.
 */
export function offsetCoverage(cov: Float32Array, w: number, h: number, offsetPx: number): Float32Array {
  if (offsetPx === 0) return cov;
  const r = Math.ceil(Math.abs(offsetPx)) + 1;
  const soft = boxBlurField(cov, w, h, r);
  // A box of width (2r+1) ramps linearly across the edge: level set `t` sits
  // at signed distance (0.5 - t)·(2r+1) outside the boundary.
  const t = 0.5 - offsetPx / (2 * r + 1);
  const aa = 1 / (2 * r + 1); // ≈1px of anti-aliasing around the cut
  const lo = t - aa;
  const hi = t + aa;
  const out = new Float32Array(cov.length);
  for (let i = 0; i < cov.length; i++) {
    let u = (soft[i]! - lo) / (hi - lo);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    out[i] = u * u * (3 - 2 * u);
  }
  return out;
}

/**
 * Convert a feather radius given in PHOTO pixels into MASK pixels. AI masks
 * often come back at a lower resolution than the photo; blurring them by the
 * raw radius and then upscaling magnifies the feather (the old code's wide,
 * glowing edges). Scaling by mask/photo width keeps the on-screen softness at
 * the intended size regardless of the mask's resolution.
 */
export function featherRadiusInMaskPx(radiusPhotoPx: number, maskW: number, photoW: number): number {
  if (!(photoW > 0) || !(maskW > 0)) return radiusPhotoPx;
  return radiusPhotoPx * (maskW / photoW);
}

/**
 * Feather a mask INWARD by ~`radius` px (already in mask pixels — see
 * {@link featherRadiusInMaskPx}) and return it as an opaque white-on-black
 * canvas: the same format as the backend's mask PNGs, so the GL engine's `.r`
 * sample and the 2D engine's red×alpha conversion both read it unchanged, with
 * no premultiplied-alpha precision loss at low coverage. Coverage is read as
 * red × alpha, so backend white-on-black opaque PNGs and hand-drawn
 * white-on-transparent canvases both work. Returns null where the DOM is
 * unavailable or the mask's pixels can't be read (tainted canvas) — callers
 * fall back to the crisp un-feathered mask.
 */
export function featherMaskInward(
  mask: CanvasImageSource,
  w: number,
  h: number,
  radius: number,
): HTMLCanvasElement | null {
  return transformMaskCanvas(mask, w, h, (hard) =>
    chokeInward(hard, blurCoverage(hard, w, h, radius)),
  );
}

/**
 * Grow (positive offset) or shrink (negative offset) a mask by ~`offsetPx`
 * mask pixels — the DOM wrapper around {@link offsetCoverage}, with the same
 * output contract and failure behaviour as {@link featherMaskInward}.
 */
export function offsetMaskCanvas(
  mask: CanvasImageSource,
  w: number,
  h: number,
  offsetPx: number,
): HTMLCanvasElement | null {
  return transformMaskCanvas(mask, w, h, (hard) => offsetCoverage(hard, w, h, offsetPx));
}

/** Read a mask's coverage (red × alpha), run `transform` over it, and write
 *  the result back as an opaque white-on-black canvas. Returns null where the
 *  DOM is unavailable or the mask is unreadable (tainted). */
function transformMaskCanvas(
  mask: CanvasImageSource,
  w: number,
  h: number,
  transform: (hard: Float32Array) => Float32Array,
): HTMLCanvasElement | null {
  if (typeof document === "undefined" || w <= 0 || h <= 0) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(mask, 0, 0, w, h);
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted — the caller keeps the untouched mask
  }
  const px = img.data;
  const hard = new Float32Array(w * h);
  for (let i = 0, p = 0; i < hard.length; i++, p += 4) {
    hard[i] = (px[p]! * px[p + 3]!) / 65025; // red × alpha, normalised to 0..1
  }
  const cov = transform(hard);
  for (let i = 0, p = 0; i < cov.length; i++, p += 4) {
    const v = Math.round(cov[i]! * 255);
    px[p] = v;
    px[p + 1] = v;
    px[p + 2] = v;
    px[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
