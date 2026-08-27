/**
 * What light the recolour canvas actually arrived with.
 *
 * The engines paint by MODULATING a swatch with the light they find in the canvas
 * underneath (see webgl-recolor.ts). That works only if two assumptions about the
 * canvas hold, and in the field both of them break:
 *
 *  1. **The cleaned canvas is fresh white.** `ImageCleanerService` asks a generative
 *     model to repaint every paintable surface white precisely so the photo of those
 *     surfaces becomes an illumination map, and the shader then recovers the light by
 *     dividing by {@link REF_WHITE}. When the model drifts and hands back a grey wall
 *     instead, that division is by the wrong number and EVERY colour on that surface
 *     renders dark by the size of the drift — which nobody reads as a dark render.
 *     They read it as the swatch being wrong.
 *
 *  2. **The cleaned canvas still has its shading.** The same prompt insists the
 *     model preserve each surface's light and shade. When it flattens them instead,
 *     the shader multiplies by a near-constant and the result is a sticker, however
 *     good the shader is.
 *
 * Neither is fixable in the shader, because the shader cannot see what it wasn't
 * given. Both are fixable HERE, by measuring what the canvas actually delivered and
 * telling the engine — and, for the shading, by recovering it from the original
 * photograph, which still has every shadow the clean-up dropped.
 *
 * Everything in this module is pure measurement over already-rasterized pixels, at a
 * small working resolution, and degrades to null (never a wrong number) wherever the
 * DOM, a 2D context or a readable source is missing.
 */

import { lumaStats, maskBits, rasterize } from "./render-metrics";

/**
 * sRGB value of fresh white paint at LRV ~85 — the albedo the clean-up is asked to
 * deliver, and the number the anchored shading divides by when nothing better has
 * been measured. Mirrored by `ImageCleanerService.EXT_WALL` on the backend: if one
 * moves, move the other.
 *
 * Both engines import this rather than each holding a copy, which is what let the
 * two drift apart into a GL `REF_WHITE` and a 2D `REF_WHITE_L` that only happened
 * to agree.
 */
export const REF_WHITE = 0.94;

/**
 * How much of a below-white canvas is believed to be genuine dim light rather than a
 * clean-up that painted grey.
 *
 * A single image cannot tell those two apart — dim light on white paint and bright
 * light on grey paint are the same pixels, which is the oldest ambiguity in the
 * subject and not one more measurement will settle. So this is a deliberate split,
 * weighted toward "the paint": the clean-up was ASKED for white, so when it delivers
 * 0.72 the likeliest explanation is drift, not dusk.
 *
 * At 0 the delivered white is fully believed to be albedo and the surface's lit face
 * always renders at the exact swatch, losing every trace of a dim scene. At 1 it is
 * fully believed to be light and nothing is corrected — today's behaviour, and the
 * bug. The value below keeps a dusk facade visibly dimmer than a noon one while
 * recovering most of a drifted clean-up's lost brightness.
 */
const DIM_TRUST = 0.35;

/**
 * Bounds on the measured white. The floor matters most: a mask that has slipped onto
 * a roof or a shadowed return would otherwise report a very dark "white" and ask the
 * shader for a 4x gain. FORM_CEIL would catch that, but catching it here keeps the
 * blow-up out of the render entirely.
 */
const WHITE_FLOOR = 0.5;
const WHITE_CEIL = 1;

/**
 * Luminance spread (95th/5th percentile) at which a surface is judged to have
 * arrived with its light intact, and the spread at or below which it is judged flat.
 * Between the two the recovered relief ramps in, so a canvas that is merely dull
 * doesn't switch hard into a fully synthesised one.
 *
 * The measured evidence behind the numbers: an untouched photograph of a two-storey
 * facade spans about 3.1x down one plane, and the flat canvas that prompted this work
 * spanned 1.1x.
 */
const FLAT_SPREAD = 1.18;
const LIT_SPREAD = 1.7;

/** Working grid for these statistics. They are all low-frequency by nature — a white
 *  point and a percentile spread do not sharpen with more pixels — so this is small
 *  on purpose: the studio measures every region on every project open. */
const LIGHT_SAMPLE_MAX = 320;

/** Longest edge of the recovered relief map. Relief is broad shading by construction
 *  (see {@link buildReliefMap}), so it costs nothing to carry it at this size and let
 *  the GPU's bilinear filter stretch it over a 4K canvas. */
const RELIEF_MAX = 512;

/** Blur radii bounding the band of detail the relief map keeps, as a fraction of the
 *  map's longest edge. Below the small radius is sensor noise and plaster grain —
 *  the part that would ghost if the clean-up moved anything by a pixel. Above the
 *  large radius is the scene's overall exposure, which the canvas already carries. */
const RELIEF_FINE = 0.004;
const RELIEF_BROAD = 0.12;

/** The relief map encodes a ratio in [0.5, 1.5] as a byte, so 1.0 (no shading) lands
 *  on mid-grey and the shader decodes with a single add. */
const RELIEF_MIN_RATIO = 0.5;
const RELIEF_SPAN = 1;

/** What one region's pixels say about the canvas it arrived on. */
export interface RegionLight {
  /**
   * The white this surface was actually delivered at, 0..1 — the 95th percentile of
   * its luminance, i.e. how bright its LIT face is. The shader divides by this
   * instead of assuming {@link REF_WHITE}, so a clean-up that painted grey no longer
   * costs the customer's swatch its brightness.
   */
  whitePoint: number;
  /**
   * How much of the shading should be recovered from the original photograph, 0..1.
   * 0 where the canvas arrived with its own light and nothing needs recovering; 1
   * where it arrived flat and the multiply would otherwise have nothing to modulate.
   */
  relief: number;
  /** The measured spread (p95/p5) behind {@link relief}, kept for the admin bench so
   *  a reading can be shown rather than just acted on. */
  spread: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The light in one recolour canvas, rasterized once and then asked about region by
 * region.
 *
 * Built once per canvas rather than per region: the studio paints every applied wall
 * in one frame, and rasterizing a 4K photo separately for each of them was the whole
 * cost of the measurement.
 */
export class SceneLight {
  private constructor(private readonly px: ImageData) {}

  /** Measure a canvas, or null where it cannot be read (no DOM, tainted source). */
  static from(canvas: CanvasImageSource, maxDim = LIGHT_SAMPLE_MAX): SceneLight | null {
    const dims = sizeOf(canvas);
    if (!dims) return null;
    const scale = Math.min(1, maxDim / Math.max(dims.w, dims.h));
    const w = Math.max(1, Math.round(dims.w * scale));
    const h = Math.max(1, Math.round(dims.h * scale));
    const px = rasterize(canvas, w, h, true);
    return px ? new SceneLight(px) : null;
  }

  /**
   * What the canvas delivered inside one region's mask, or null when the mask cannot
   * be read or covers nothing. A null answer means "measure nothing, change nothing":
   * every caller leaves the corresponding RegionPaint fields unset and the engines
   * fall back to their previous behaviour.
   */
  region(mask: CanvasImageSource): RegionLight | null {
    const m = rasterize(mask, this.px.width, this.px.height, false);
    return m ? regionLightFrom(this.px, maskBits(m)) : null;
  }
}

/**
 * What the canvas delivered inside one mask, from pixels that are already in hand.
 *
 * The white point is the 95th PERCENTILE, not the mean, and the difference is the
 * whole point: the mean of a wall with a deep balcony recess in it sits well below
 * the wall's lit face, and calibrating to it would brighten the whole surface to
 * make its shadows average out. The lit face is what the clean-up was asked to paint
 * white and what the customer holds a paint chip against.
 *
 * Null where the mask covers nothing, or covers only black — both mean "no answer",
 * and every caller then leaves the paint's fields unset rather than passing a
 * fabricated one.
 */
export function regionLightFrom(px: ImageData, bits: Uint8Array): RegionLight | null {
  const stats = lumaStats(px, bits);
  if (stats.p95 <= 0) return null;
  return {
    whitePoint: clamp(stats.p95 / 255, WHITE_FLOOR, WHITE_CEIL),
    relief: reliefFor(stats.spread),
    spread: stats.spread,
  };
}

/**
 * How much recovered shading a surface with this luminance spread needs: none once
 * it has light of its own, all of it once it is flat, ramped in between.
 */
export function reliefFor(spread: number): number {
  if (spread >= LIT_SPREAD) return 0;
  if (spread <= FLAT_SPREAD) return 1;
  return (LIT_SPREAD - spread) / (LIT_SPREAD - FLAT_SPREAD);
}

/**
 * The scene's broad shading, recovered from the ORIGINAL photograph as a ratio map
 * the engines multiply into their form term.
 *
 * The map is a band-pass, `blur(fine) / blur(broad)`, not the `photo / blur(photo)`
 * an obvious reading would suggest, and both bounds earn their place:
 *
 *  - Dividing by a BROAD blur is what removes the old paint colour. A dark green wall
 *    is dark because of its pigment, and pigment is smooth; shadow is not. Taking the
 *    ratio to a large-radius blur cancels anything that varies as slowly as the old
 *    albedo did and keeps the soffit shadows, the balcony recess and the falloff
 *    across a facade.
 *
 *  - Blurring the NUMERATOR is what makes this safe to use at all. The clean-up is a
 *    generative pass, and its output is only ever approximately registered against
 *    the photograph it came from. Fine detail transferred across that gap would land
 *    a pixel or two off and read as ghosting — a second, faint set of window frames.
 *    Broad shading survives the same misregistration without a visible seam, so the
 *    map deliberately carries only what is robust to it.
 *
 * The real surface texture is NOT recovered here. The engines already carry the
 * canvas's own high-frequency detail onto the new colour, and that copy is perfectly
 * registered because it comes from the canvas being painted.
 *
 * Returns null where the DOM, a 2D context or a readable source is missing; callers
 * treat that as "no relief available" and paint exactly as they did before.
 */
export function buildReliefMap(photo: CanvasImageSource): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const dims = sizeOf(photo);
  if (!dims) return null;
  const scale = Math.min(1, RELIEF_MAX / Math.max(dims.w, dims.h));
  const w = Math.max(1, Math.round(dims.w * scale));
  const h = Math.max(1, Math.round(dims.h * scale));

  const fine = blurred(photo, w, h, Math.max(1, Math.round(Math.max(w, h) * RELIEF_FINE)));
  const broad = blurred(photo, w, h, Math.max(2, Math.round(Math.max(w, h) * RELIEF_BROAD)));
  if (!fine || !broad) return null;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(w, h);
  img.data.set(encodeRelief(fine, broad));
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * The ratio of two blurred copies, as RGBA bytes the shader decodes with one add.
 *
 * Split out from {@link buildReliefMap} because this is the part with arithmetic in
 * it, and the part that has to agree exactly with the shader's `0.5 + texel`: a wall
 * with no shading on it must come back as mid-grey and multiply by 1.
 */
export function encodeRelief(fine: ImageData, broad: ImageData): Uint8ClampedArray {
  const f = fine.data;
  const b = broad.data;
  const d = new Uint8ClampedArray(f.length);
  for (let i = 0; i < d.length; i += 4) {
    // A floor under both terms: a near-black corner would otherwise divide two
    // rounding errors by each other and report violent shading where there is none.
    const lf = 0.2126 * f[i]! + 0.7152 * f[i + 1]! + 0.0722 * f[i + 2]! + 4;
    const lb = 0.2126 * b[i]! + 0.7152 * b[i + 1]! + 0.0722 * b[i + 2]! + 4;
    const ratio = clamp(lf / lb, RELIEF_MIN_RATIO, RELIEF_MIN_RATIO + RELIEF_SPAN);
    const v = Math.round(((ratio - RELIEF_MIN_RATIO) / RELIEF_SPAN) * 255);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  return d;
}

/** One blurred copy of a source at the working size, as readable pixels. */
function blurred(source: CanvasImageSource, w: number, h: number, radius: number): ImageData | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.filter = `blur(${radius}px)`;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted or undecodable — no relief rather than a wrong one
  }
}

/**
 * The gain the anchored shading should apply for a surface delivered at this white,
 * as a single divisor: `form = blur / anchorDivisor(whitePoint)`.
 *
 * Exported because BOTH engines need the identical number — the GL shader computes it
 * per fragment from its uniform, the 2D fallback needs it on the CPU to size its gain
 * passes — and because it is the one line of this fix worth testing directly.
 *
 * At `whitePoint === REF_WHITE` it returns REF_WHITE exactly, so a canvas the
 * clean-up got right renders byte for byte as it did before this change.
 */
export function anchorDivisor(whitePoint: number): number {
  const w = clamp(whitePoint, WHITE_FLOOR, WHITE_CEIL);
  const dimness = 1 - DIM_TRUST + DIM_TRUST * (w / REF_WHITE);
  return w / dimness;
}

function sizeOf(s: CanvasImageSource): { w: number; h: number } | null {
  const any = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = Number(any.naturalWidth || any.width || 0);
  const h = Number(any.naturalHeight || any.height || 0);
  return w > 0 && h > 0 ? { w, h } : null;
}
