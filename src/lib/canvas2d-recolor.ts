/**
 * Canvas 2D fallback recolor engine.
 *
 * Implements the same `RecolorEngine` contract as the WebGL2 `Recolor` class,
 * for browsers where `canvas.getContext("webgl2")` is unavailable. The
 * compositing is approximate (good enough for a preview), mirroring the GL
 * shader's behaviour as closely as plain 2D blending allows:
 *
 *  - A region mask (white-on-black; the red channel is the coverage signal,
 *    exactly what the GL shader samples) is converted ONCE into an alpha mask
 *    via getImageData and cached per source object. A tainted/unreadable mask
 *    skips its region rather than flood-filling the photo.
 *  - Flat fill (preserve = 0) matches WebGL exactly: the swatch colour drawn
 *    through the mask's alpha with normal source-over blending.
 *  - Shadow preservation (preserve > 0) approximates the shader's per-pixel
 *    `paint × clamp(L / baseL, 0.35, 2.2)` relief: the photo is multiplied
 *    with the swatch ('multiply' keeps shadows/curvature), then gained back
 *    up by ~1/baseL with additive ('lighter') passes so the region's AVERAGE
 *    pixel still lands on the swatch; channels clip at white, roughly like
 *    the shader's mix-toward-white. The relief layer is blended with the flat
 *    fill by `preserve`, matching the shader's `mix(1.0, ratio, preserve)`.
 */

import type { RecolorEngine, RecolorSource, RegionPaint } from "./recolor-engine";
import { featherMaskInward, featherRadiusInMaskPx } from "./mask-feather";
import { buildGuide, refineMaskToImage, type Guide } from "./mask-refine";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The shader clamps its relief ratio to [0.30, 2.4]; cap our gain the same way. */
const MAX_GAIN = 2.4;

/** sRGB value of fresh white paint (LRV ~85) — mirrors the GL shader's
 *  REF_WHITE. In anchored mode (cleaned canvas, surfaces known white) the
 *  multiply pass is gained back by 1/REF_WHITE instead of 1/baseL, so the
 *  paint keeps the photo's own light level rather than averaging to the
 *  full-brightness swatch. */
const REF_WHITE_L = 0.94;

/** Subtle surface grain tile so a flat fill reads as painted plaster, mirroring
 *  the GL shader's u_grain. Built once and tiled over each region layer. */
function buildGrainTile(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Centred on mid-grey (128): under 'overlay' this leaves the paint colour
    // alone and only jitters lightness a few percent up or down.
    const v = 128 + ((Math.random() * 24) | 0) - 12;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function sourceSize(s: RecolorSource): { w: number; h: number } {
  const any = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { w: Number(any.naturalWidth || any.width || 0), h: Number(any.naturalHeight || any.height || 0) };
}

function cssColor(target: [number, number, number]): string {
  const c = (n: number) => Math.round(clamp01(n) * 255);
  return `rgb(${c(target[0])}, ${c(target[1])}, ${c(target[2])})`;
}

export class Canvas2DRecolor implements RecolorEngine {
  private ctx: CanvasRenderingContext2D;
  private source: RecolorSource | null = null;
  /** Mask source → alpha-converted mask (alpha = red channel × mask alpha), built once.
   *  `null` marks a mask we could not read (tainted) so we don't retry every frame. */
  private alphaMaskCache = new Map<RecolorSource, HTMLCanvasElement | null>();
  // Scratch layers reused across frames (resized lazily) to avoid per-frame allocations.
  private layer: HTMLCanvasElement;
  private layerCtx: CanvasRenderingContext2D;
  private shadeLayer: HTMLCanvasElement;
  private shadeCtx: CanvasRenderingContext2D;
  /** Static grain tile, built once, tiled over each region layer for surface texture. */
  private grainTile: HTMLCanvasElement | null;
  /** Mask-edge feather radius in px; 0 (default) keeps edges crisp. */
  private featherPx = 0;
  /** Whole-image brightness gamma; 1 (default) leaves the photo untouched. */
  private brightGamma = 1;
  /** Edge snapping (the studio's "Snap edges" toggle; ON by default) — masks
   *  are refined against the photo so painted boundaries lock onto real image
   *  edges instead of the AI mask's approximation (see mask-refine.ts). */
  private edgeSnap = true;
  /** Working-res photo guide for edge snapping. undefined = not built yet,
   *  null = build failed (no DOM / tainted photo) — don't retry every mask. */
  private guide: Guide | null | undefined = undefined;
  /** Mask source → snapped mask canvas. null marks a mask that could not be
   *  refined (unreadable) so we fall back to the raw mask without retrying. */
  private refineCache = new Map<RecolorSource, HTMLCanvasElement | null>();

  constructor(public readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D rendering is not supported in this browser.");
    this.ctx = ctx;
    this.layer = document.createElement("canvas");
    this.shadeLayer = document.createElement("canvas");
    const layerCtx = this.layer.getContext("2d");
    const shadeCtx = this.shadeLayer.getContext("2d");
    if (!layerCtx || !shadeCtx) throw new Error("Canvas 2D rendering is not supported in this browser.");
    this.layerCtx = layerCtx;
    this.shadeCtx = shadeCtx;
    this.grainTile = buildGrainTile();
  }

  setImage(source: RecolorSource) {
    this.source = source;
    const { w, h } = sourceSize(source);
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    this.canvas.width = Math.round((w || this.canvas.width) * dpr);
    this.canvas.height = Math.round((h || this.canvas.height) * dpr);
    // A new photo means the old project's masks are gone — drop their alpha
    // masks, their snapped refinements, and the old photo's edge-snap guide.
    this.alphaMaskCache.clear();
    this.refineCache.clear();
    this.guide = undefined;
  }

  /**
   * Toggle edge snapping (see mask-refine.ts). Cached alpha masks were built
   * with the OLD setting baked in, so a change drops them; the snapped
   * refinements themselves stay cached — re-enabling snap is instant.
   */
  setEdgeSnap(on: boolean) {
    if (on === this.edgeSnap) return;
    this.edgeSnap = on;
    this.alphaMaskCache.clear();
  }

  /** Snap one mask to the photo's edges, once, building the photo guide on
   *  first use. Returns null (raw mask is used) when photo or mask is
   *  unreadable. */
  private refined(mask: RecolorSource): HTMLCanvasElement | null {
    const cached = this.refineCache.get(mask);
    if (cached !== undefined) return cached;
    if (this.guide === undefined) {
      const dims = this.source ? sourceSize(this.source) : { w: 0, h: 0 };
      this.guide = this.source
        ? buildGuide(this.source as CanvasImageSource, dims.w, dims.h)
        : null;
    }
    const refined = this.guide ? refineMaskToImage(mask as CanvasImageSource, this.guide) : null;
    this.refineCache.set(mask, refined);
    return refined;
  }

  /** Paint the photo through 0..N region masks, compositing them all in one frame. */
  renderRegions(regions: ReadonlyArray<RegionPaint>) {
    const { canvas, ctx, source } = this;
    if (!source) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    // Base pass: the untouched photograph.
    ctx.drawImage(source, 0, 0, w, h);
    // Region passes: blend each painted mask on top (alpha = coverage × strength,
    // the same blend the GL engine uses: SRC_ALPHA / ONE_MINUS_SRC_ALPHA).
    for (const r of regions) {
      if (!r.mask) continue;
      const alphaMask = this.alphaMask(r.mask);
      if (!alphaMask) continue;
      const layer = this.buildRegionLayer(r, alphaMask, w, h);
      ctx.globalAlpha = clamp01(r.strength ?? 1);
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
    }
    this.applyBrightness(w, h);
  }

  /**
   * Whole-image brighten (the studio's "Brighten" control), approximated with
   * the CSS brightness() filter in a single self-draw over the composed frame.
   * The GL engine's gamma lift is converted to the linear multiplier that
   * matches it at mid-grey. Browsers without canvas filter support silently
   * skip it (`ctx.filter` stays "none" as an unknown property does nothing) —
   * this engine is already the approximate fallback.
   */
  private applyBrightness(w: number, h: number) {
    if (this.brightGamma <= 1.001) return;
    const { ctx, canvas } = this;
    const mult = Math.pow(0.5, 1 / this.brightGamma - 1);
    ctx.globalCompositeOperation = "copy";
    ctx.filter = `brightness(${mult.toFixed(3)})`;
    ctx.drawImage(canvas, 0, 0, w, h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Sets the whole-image brightness lift as a gamma, 1 = untouched. Takes
   * effect on the next render; no caches depend on it.
   */
  setBrightness(gamma: number) {
    this.brightGamma = Math.max(1, gamma);
  }

  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase() {
    this.renderRegions([]);
  }

  /**
   * Sets the mask-edge feather radius (the studio's "soft edges" toggle).
   * 0 = crisp edges, the default. Cached alpha masks were built with the OLD
   * radius baked in, so a change drops them — they rebuild on the next render.
   */
  setMaskFeather(radius: number) {
    const px = Math.max(0, radius);
    if (px === this.featherPx) return;
    this.featherPx = px;
    this.alphaMaskCache.clear();
  }

  exportPng(): string { return this.canvas.toDataURL("image/png"); }

  dispose() {
    this.source = null;
    this.alphaMaskCache.clear();
    this.refineCache.clear();
    this.guide = undefined;
    // Free the scratch bitmaps.
    this.layer.width = this.layer.height = 0;
    this.shadeLayer.width = this.shadeLayer.height = 0;
    if (this.grainTile) {
      this.grainTile.width = this.grainTile.height = 0;
      this.grainTile = null;
    }
  }

  /** Build the full-canvas colour layer for one region, shaped by its alpha mask. */
  private buildRegionLayer(r: RegionPaint, alphaMask: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
    const layer = this.layer;
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const lctx = this.layerCtx;
    lctx.globalCompositeOperation = "source-over";
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, w, h);
    // Flat exact swatch — identical to the GL shader with preserve = 0.
    lctx.fillStyle = cssColor(r.target);
    lctx.fillRect(0, 0, w, h);

    const preserve = clamp01(r.preserve ?? 0);
    const baseL = Math.max(0, r.baseL ?? 0);
    const anchored = r.anchor === true;
    if (preserve > 0.001 && (baseL > 0.001 || anchored) && this.source) {
      const shade = this.shadeLayer;
      if (shade.width !== w || shade.height !== h) {
        shade.width = w;
        shade.height = h;
      }
      const sctx = this.shadeCtx;
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      sctx.clearRect(0, 0, w, h);
      sctx.drawImage(this.source, 0, 0, w, h);
      // swatch × photo: darker photo pixels darken the paint, so shadows and
      // curvature survive.
      sctx.globalCompositeOperation = "multiply";
      sctx.fillStyle = cssColor(r.target);
      sctx.fillRect(0, 0, w, h);
      // Multiplying dimmed the region relative to the shader's neutral point.
      // Gain it back additively: each 'lighter' self-draw at alpha a multiplies
      // the layer by (1 + a). Anchored (cleaned canvas, surfaces known white):
      // the neutral is fresh-white albedo, so the paint keeps the photo's own
      // light level. Legacy: the neutral is the region's mean luminance, so the
      // region's AVERAGE still lands on the swatch.
      sctx.globalCompositeOperation = "lighter";
      const neutral = anchored ? REF_WHITE_L : baseL;
      let remaining = Math.min(MAX_GAIN, 1 / Math.max(neutral, 1 / MAX_GAIN));
      while (remaining > 1.01) {
        const a = Math.min(1, remaining - 1);
        sctx.globalAlpha = a;
        sctx.drawImage(shade, 0, 0);
        remaining /= 1 + a;
      }
      sctx.globalAlpha = 1;
      sctx.globalCompositeOperation = "source-over";
      // Blend the relief over the flat fill by `preserve` — the 2D stand-in for
      // the shader's mix(1.0, ratio, u_preserve).
      lctx.globalAlpha = preserve;
      lctx.drawImage(shade, 0, 0);
      lctx.globalAlpha = 1;
    }

    // Surface grain (mirrors the GL shader's u_grain): 'overlay' keeps the paint
    // colour and only jitters lightness a touch, so the flat fill reads as a real
    // painted surface. Applied before masking so it's clipped to the region.
    if (this.grainTile) {
      lctx.globalCompositeOperation = "overlay";
      lctx.globalAlpha = 0.5;
      for (let gy = 0; gy < h; gy += this.grainTile.height) {
        for (let gx = 0; gx < w; gx += this.grainTile.width) {
          lctx.drawImage(this.grainTile, gx, gy);
        }
      }
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = "source-over";
    }

    // Shape the filled layer with the region's coverage.
    lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(alphaMask, 0, 0, w, h);
    lctx.globalCompositeOperation = "source-over";
    return layer;
  }

  /**
   * Convert a mask into an alpha mask once and cache it: alpha = red channel ×
   * the mask's own alpha, which handles BOTH backend white-on-black opaque PNGs
   * and hand-drawn white-on-transparent canvases (matching the GL shader's
   * `texture(u_mask).r` coverage signal). Returns null for a mask whose pixels
   * cannot be read (tainted canvas) — the caller skips that region.
   */
  private alphaMask(mask: RecolorSource): HTMLCanvasElement | null {
    const cached = this.alphaMaskCache.get(mask);
    if (cached !== undefined) return cached;
    let result: HTMLCanvasElement | null = null;
    let source: CanvasImageSource = mask as CanvasImageSource;
    let { w, h } = sourceSize(mask);
    if (w > 0 && h > 0) {
      // Edge snap first (ON by default): re-attach the mask boundary to the
      // photo's real edges (see mask-refine.ts). The snapped mask lives at the
      // guide's working resolution, so the alpha canvas adopts its dimensions.
      if (this.edgeSnap) {
        const refined = this.refined(mask);
        if (refined) {
          source = refined;
          w = refined.width;
          h = refined.height;
        }
      }
      // Then the optional inward feather (the "soft edges" toggle): the paint
      // fades in just inside the boundary and never spills past it — a plain
      // Gaussian blur here used to bleed colour onto sky, frames and railing
      // gaps as a glowing halo. The radius is in photo pixels; rescale it to
      // this mask's own resolution so a low-res mask doesn't magnify it.
      if (this.featherPx > 0) {
        const photoW = this.source ? sourceSize(this.source).w : 0;
        const feathered = featherMaskInward(
          source, w, h, featherRadiusInMaskPx(this.featherPx, w, photoW),
        );
        if (feathered) source = feathered; // unreadable mask — keep it crisp
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      if (cctx) {
        cctx.drawImage(source, 0, 0, w, h);
        try {
          const data = cctx.getImageData(0, 0, w, h);
          const px = data.data;
          for (let i = 0; i < px.length; i += 4) {
            px[i + 3] = Math.round((px[i]! * px[i + 3]!) / 255);
          }
          cctx.putImageData(data, 0, 0);
          result = c;
        } catch {
          result = null; // tainted — skip the region rather than mispaint the photo
        }
      }
    }
    this.alphaMaskCache.set(mask, result);
    return result;
  }
}
