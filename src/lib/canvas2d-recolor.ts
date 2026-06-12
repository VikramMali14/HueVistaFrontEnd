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

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The shader clamps its relief ratio to [0.35, 2.2]; cap our gain the same way. */
const MAX_GAIN = 2.2;

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
  }

  setImage(source: RecolorSource) {
    this.source = source;
    const { w, h } = sourceSize(source);
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    this.canvas.width = Math.round((w || this.canvas.width) * dpr);
    this.canvas.height = Math.round((h || this.canvas.height) * dpr);
    // A new photo means the old project's masks are gone — drop their alpha masks.
    this.alphaMaskCache.clear();
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
  }

  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase() {
    this.renderRegions([]);
  }

  exportPng(): string { return this.canvas.toDataURL("image/png"); }

  dispose() {
    this.source = null;
    this.alphaMaskCache.clear();
    // Free the scratch bitmaps.
    this.layer.width = this.layer.height = 0;
    this.shadeLayer.width = this.shadeLayer.height = 0;
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
    if (preserve > 0.001 && baseL > 0.001 && this.source) {
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
      // Multiplying dimmed the region by ~baseL relative to the shader (which
      // normalises by the region's mean luminance). Gain it back additively:
      // each 'lighter' self-draw at alpha a multiplies the layer by (1 + a).
      sctx.globalCompositeOperation = "lighter";
      let remaining = Math.min(MAX_GAIN, 1 / Math.max(baseL, 1 / MAX_GAIN));
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
    const { w, h } = sourceSize(mask);
    if (w > 0 && h > 0) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      if (cctx) {
        cctx.drawImage(mask, 0, 0, w, h);
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
