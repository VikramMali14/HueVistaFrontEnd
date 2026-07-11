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
  /** Scene-light anchoring. Set ONLY when the canvas is the CLEANED image,
   *  whose paintable surfaces were repainted fresh white: the photo is then an
   *  illumination map, and the engine modulates the swatch by it — brightness
   *  AND colour cast — instead of normalising the region's mean up to the
   *  swatch. An evening photo keeps its evening light instead of snapping to
   *  flat daylight. No effect when preserve is 0. */
  anchor?: boolean;
  /** Overall opacity 0..1 — used to fade a region out (e.g. compare view). */
  strength?: number;
  /** Surface grain amplitude, ~0..0.05: a touch of per-pixel noise so a flat
   *  swatch reads as painted plaster instead of a CGI fill. Undefined = engine
   *  default (see DEFAULT_GRAIN in each engine). */
  grain?: number;
}

/**
 * Feather radius (px) applied to mask edges when the user turns the
 * "soft edges" toggle ON. Feathering is OFF by default: users reported the
 * softened edge as a visible "blur" effect — a glowing halo around the
 * recoloured walls, the accent wall and the window borders — so crisp 0/255
 * edges are the baseline (the engines' bilinear mask scaling already removes
 * the raw staircase). But on photos where the AI mask sits a pixel or two off
 * the real surface boundary, a small feather hides the misregistration, so
 * it's now the user's call: engines expose {@link RecolorEngine.setMaskFeather}
 * and the studio surfaces it as a toggle using this radius.
 */
export const SOFT_EDGE_FEATHER_PX = 2;

export interface RecolorEngine {
  /** The on-screen canvas this engine draws into. */
  readonly canvas: HTMLCanvasElement;
  /** Upload/replace the source photograph (resets per-photo mask caches). */
  setImage(source: RecolorSource): void;
  /** Paint the photo through 0..N region masks, compositing them all in one frame. */
  renderRegions(regions: ReadonlyArray<RegionPaint>): void;
  /** Set the mask-edge feather radius in px (0 = crisp edges, the default).
   *  Changing the value invalidates any cached masks; callers re-render after.
   *  Optional so lightweight test doubles don't have to implement it. */
  setMaskFeather?(radius: number): void;
  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase(): void;
  /** PNG data URL of the current canvas contents. */
  exportPng(): string;
  /** Release engine resources; the instance must not be used afterwards. */
  dispose(): void;
}
