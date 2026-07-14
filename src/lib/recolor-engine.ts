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
 * Feather radius (in PHOTO pixels) applied to mask edges when the user turns
 * the "soft edges" toggle ON. Feathering is OFF by default — crisp 0/255
 * edges are the baseline (the engines' bilinear mask scaling already removes
 * the raw staircase) — and the toggle opts in via
 * {@link RecolorEngine.setMaskFeather}.
 *
 * The feather is INWARD-only ("choked": blur, re-steepen, clamp by the hard
 * mask — see mask-feather.ts). An earlier plain Gaussian feather spread half
 * its ramp OUTSIDE the region, bleeding paint onto the sky, window borders
 * and railing gaps as a glowing halo; the inward feather keeps crisp mode's
 * exact outline and fades the paint in over this many pixels just inside it,
 * so no colour ever crosses the boundary. Engines rescale the radius to each
 * mask's own resolution, so low-res AI masks don't magnify the softness.
 */
export const SOFT_EDGE_FEATHER_PX = 3;

/**
 * The studio's "Brighten" control: a whole-image light lift for photos shot
 * in dim or flat light, so users can judge colours the way the wall would
 * read on a sunnier day. Three fixed levels (no free slider — a slider
 * invites over-brightening that falsifies the shades):
 *
 *  - Original:  the photo untouched (default).
 *  - Soft glow: a gentle midtone lift, like opening the curtains.
 *  - Radiant:   a strong lift for genuinely dark photos.
 *
 * `gamma` is the midtone lift the engines consume via
 * {@link RecolorEngine.setBrightness}: output = input^(1/gamma), 1 = off.
 * A gamma lift (not a linear multiply) brightens shadows and midtones while
 * leaving pure white in place, so bright skies don't clip to a white blob.
 */
export interface BrightenLevel {
  id: "original" | "soft" | "radiant";
  /** Short label shown on the studio's segmented control. */
  label: string;
  /** Midtone lift, 1 = untouched. See above. */
  gamma: number;
}

export const BRIGHTEN_LEVELS: ReadonlyArray<BrightenLevel> = [
  { id: "original", label: "Original", gamma: 1 },
  { id: "soft", label: "Soft glow", gamma: 1.25 },
  { id: "radiant", label: "Radiant", gamma: 1.6 },
];

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
  /** Toggle edge snapping (ON by default): each mask is refined against the
   *  photo so painted boundaries lock onto real image edges — window frames,
   *  wall/sky lines, railings — instead of the AI mask's approximation of
   *  them (see mask-refine.ts). The studio's "Snap edges" toggle opts out for
   *  photos where the mask is already pixel-perfect. Changing it invalidates
   *  cached masks; callers re-render after. Optional for test doubles. */
  setEdgeSnap?(on: boolean): void;
  /** Set the whole-image brightness lift as a gamma (1 = untouched photo);
   *  see {@link BRIGHTEN_LEVELS}. Applies to the NEXT render — callers
   *  re-render after changing it. Optional for lightweight test doubles. */
  setBrightness?(gamma: number): void;
  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase(): void;
  /** PNG data URL of the current canvas contents. */
  exportPng(): string;
  /** Release engine resources; the instance must not be used afterwards. */
  dispose(): void;
}
