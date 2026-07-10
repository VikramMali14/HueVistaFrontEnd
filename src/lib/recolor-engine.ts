/**
 * Shared contract for the two preview renderers: the WebGL2 engine
 * (`Recolor` in webgl-recolor.ts, full fidelity) and the Canvas 2D fallback
 * (`Canvas2DRecolor` in canvas2d-recolor.ts, approximate). The visualizer
 * codes against this interface so either implementation can sit behind the
 * same ref.
 */

/** Image sources BOTH engines accept (valid as a GL texture AND for 2D drawImage). */
export type RecolorSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** One painted region to composite over the photo. */
export interface RegionPaint {
  /** White-on-black region mask at (any) resolution; null skips the region. */
  mask: RecolorSource | null;
  /** Target paint colour, components in 0..1. */
  target: [number, number, number];
  /** Shadow/relief preservation strength, 0..1. 0 = flat exact swatch. */
  preserve?: number;
  /** Region mean luminance in the source photo, 0..1 (needed when preserve>0). */
  baseL?: number;
  /** Overall opacity 0..1 — used to fade a region out (e.g. compare view). */
  strength?: number;
  /** Surface grain amplitude, ~0..0.05: a touch of per-pixel noise so a flat
   *  swatch reads as painted plaster instead of a CGI fill. Undefined = engine
   *  default (see DEFAULT_GRAIN in each engine). */
  grain?: number;
}

/**
 * Feather radius (px) for softening a hard binary mask edge. Feathering is now
 * DISABLED (returns 0): users reported the softened edge as a visible "blur"
 * effect — a glowing halo around the recoloured walls, the accent wall and the
 * window borders. Painting through the crisp 0/255 mask keeps every region edge
 * sharp and precisely aligned to the surface; the bilinear filtering the
 * engines already apply when scaling the mask still removes the raw staircase
 * without introducing any halo.
 *
 * Kept as a function (rather than deleting the call sites) so a small feather
 * can be reintroduced later by returning a positive value here.
 */
export function featherRadius(): number {
  return 0;
}

export interface RecolorEngine {
  /** The on-screen canvas this engine draws into. */
  readonly canvas: HTMLCanvasElement;
  /** Upload/replace the source photograph (resets per-photo mask caches). */
  setImage(source: RecolorSource): void;
  /** Paint the photo through 0..N region masks, compositing them all in one frame. */
  renderRegions(regions: ReadonlyArray<RegionPaint>): void;
  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase(): void;
  /** PNG data URL of the current canvas contents. */
  exportPng(): string;
  /** Release engine resources; the instance must not be used afterwards. */
  dispose(): void;
}
