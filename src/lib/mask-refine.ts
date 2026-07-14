/**
 * Edge snapping: refine an AI region mask against the photograph itself, so
 * the painted boundary locks onto the photo's REAL edges instead of the
 * mask's approximation of them.
 *
 * Segmentation masks routinely sit a pixel or two off the true surface
 * boundary — paint creeping onto a window frame here, an unpainted sliver of
 * old wall colour there. No amount of feathering fixes misregistration: the
 * edge must MOVE. This module runs a guided filter (He et al.) over the mask
 * using the photo as the guide: within a small band around the mask boundary,
 * coverage re-attaches to wherever the photo's colours actually change, which
 * also gives thin obstacles (railing bars, frame edges) a proper soft matte.
 *
 * The refinement is deliberately conservative:
 *
 *   - the guided alpha is re-steepened, so where the photo has no usable edge
 *     (two walls of the same colour meeting) the boundary stays a tight ramp
 *     at the mask's own line rather than smearing across the filter radius;
 *   - the result is clamped inside an eroded/dilated band of the hard mask,
 *     so snapping can only move an edge by a few pixels — it can never
 *     reassign a whole surface; and
 *   - everything runs at a capped working resolution (the alpha it produces
 *     is smooth, so upscaling it is lossless in practice) and only ONCE per
 *     mask — engines cache the refined canvas.
 *
 * The pixel math is pure (typed arrays in, typed arrays out) for unit
 * testing; only buildGuide/refineMaskToImage touch the DOM.
 */

import { boxBlurField } from "./mask-feather";

/** Longest side of the working-resolution guide image. Refinement quality is
 *  set by edge geometry, not megapixels — ~1000px keeps the guided filter
 *  well under a second per mask on mid-range hardware. */
const GUIDE_MAX_DIM = 1000;
/** Guided-filter window radius (working-res px): how far the filter looks for
 *  colour statistics around each pixel. */
const SNAP_RADIUS = 6;
/** Guided-filter regularisation. Small = strongly edge-preserving (matting
 *  grade); colours are 0..1 so this tolerates only ~1.4% channel variance
 *  before an area counts as "flat". */
const SNAP_EPS = 2e-4;
/** How far (working-res px) snapping may move the mask boundary. Beyond this
 *  band the hard mask wins outright, so refinement can fix misregistration
 *  but never migrate a region onto a different surface. */
const SNAP_BAND_PX = 4;
/** Re-steepening ramp for the guided alpha: values below LO clamp to 0, above
 *  HI to 1. Centred on 0.5 so the crossing point — the snapped edge — stays
 *  where the guided filter put it. */
const STEEPEN_LO = 0.35;
const STEEPEN_HI = 0.65;

/** The photo at working resolution, split into 0..1 colour planes. */
export interface Guide {
  w: number;
  h: number;
  ch: [Float32Array, Float32Array, Float32Array];
}

/**
 * Colour guided filter of a coverage field `p` (0..1) steered by the guide
 * image: output alpha follows `p` in flat areas but re-attaches its
 * transitions to the guide's colour edges. Pure math — no DOM.
 */
export function guidedFilterAlpha(guide: Guide, p: Float32Array, radius: number, eps: number): Float32Array {
  const { w, h } = guide;
  const [R, G, B] = guide.ch;
  const n = w * h;
  const box = (a: Float32Array) => boxBlurField(a, w, h, radius);
  const mul = (x: Float32Array, y: Float32Array) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = x[i]! * y[i]!;
    return o;
  };

  const mR = box(R), mG = box(G), mB = box(B), mP = box(p);
  // Covariance of each guide channel with the mask.
  const cR = box(mul(R, p)), cG = box(mul(G, p)), cB = box(mul(B, p));
  // Guide auto-covariance (symmetric 3×3 per pixel), regularised on the diagonal.
  const sRR = box(mul(R, R)), sRG = box(mul(R, G)), sRB = box(mul(R, B));
  const sGG = box(mul(G, G)), sGB = box(mul(G, B)), sBB = box(mul(B, B));

  const aR = new Float32Array(n);
  const aG = new Float32Array(n);
  const aB = new Float32Array(n);
  const bb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rr = sRR[i]! - mR[i]! * mR[i]! + eps;
    const rg = sRG[i]! - mR[i]! * mG[i]!;
    const rb = sRB[i]! - mR[i]! * mB[i]!;
    const gg = sGG[i]! - mG[i]! * mG[i]! + eps;
    const gb = sGB[i]! - mG[i]! * mB[i]!;
    const b2 = sBB[i]! - mB[i]! * mB[i]! + eps;
    const vR = cR[i]! - mR[i]! * mP[i]!;
    const vG = cG[i]! - mG[i]! * mP[i]!;
    const vB = cB[i]! - mB[i]! * mP[i]!;
    // Solve (Σ + eps·I) a = cov via the symmetric matrix's adjugate; eps on
    // the diagonal keeps det strictly positive even on perfectly flat areas.
    const A = gg * b2 - gb * gb;
    const Bc = rb * gb - rg * b2;
    const C = rg * gb - rb * gg;
    const D = rr * b2 - rb * rb;
    const E = rg * rb - rr * gb;
    const F = rr * gg - rg * rg;
    const det = rr * A + rg * Bc + rb * C;
    const ar = (vR * A + vG * Bc + vB * C) / det;
    const ag = (vR * Bc + vG * D + vB * E) / det;
    const ab = (vR * C + vG * E + vB * F) / det;
    aR[i] = ar;
    aG[i] = ag;
    aB[i] = ab;
    bb[i] = mP[i]! - ar * mR[i]! - ag * mG[i]! - ab * mB[i]!;
  }

  const mAR = box(aR), mAG = box(aG), mAB = box(aB), mBB = box(bb);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mAR[i]! * R[i]! + mAG[i]! * G[i]! + mAB[i]! * B[i]! + mBB[i]!;
    q[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return q;
}

/**
 * Turn a guided alpha back into a paint-ready mask: re-steepen the ramp (so
 * edge-less boundaries stay tight instead of smearing over the filter
 * radius), then clamp inside the hard mask's eroded/dilated band so the edge
 * can move at most `band` px. Pure math — no DOM.
 */
export function snapAlpha(hard: Float32Array, q: Float32Array, w: number, h: number, band: number): Float32Array {
  const inner = boxBlurField(hard, w, h, band);
  const out = new Float32Array(hard.length);
  for (let i = 0; i < hard.length; i++) {
    let t = (q[i]! - STEEPEN_LO) / (STEEPEN_HI - STEEPEN_LO);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let s = t * t * (3 - 2 * t);
    if (inner[i]! >= 0.9999) s = 1; // deep inside the region — always painted
    else if (inner[i]! <= 0.0001) s = 0; // beyond the band — never painted
    out[i] = s;
  }
  return out;
}

/**
 * Downscale the photo to working resolution and split it into colour planes.
 * Returns null where the DOM is unavailable or the photo is unreadable
 * (tainted canvas) — callers skip refinement and use masks as-is.
 */
export function buildGuide(photo: CanvasImageSource, photoW: number, photoH: number): Guide | null {
  if (typeof document === "undefined" || photoW <= 0 || photoH <= 0) return null;
  const scale = Math.min(1, GUIDE_MAX_DIM / Math.max(photoW, photoH));
  const w = Math.max(1, Math.round(photoW * scale));
  const h = Math.max(1, Math.round(photoH * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(photo, 0, 0, w, h);
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted photo — refinement unavailable
  }
  const px = img.data;
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    R[i] = px[p]! / 255;
    G[i] = px[p + 1]! / 255;
    B[i] = px[p + 2]! / 255;
  }
  return { w, h, ch: [R, G, B] };
}

/**
 * Snap one mask to the photo's edges. Returns a working-resolution opaque
 * white-on-black canvas (the same format as backend mask PNGs, ready for the
 * engines' feather/upload steps), or null where the mask can't be read —
 * callers fall back to the unrefined mask.
 */
export function refineMaskToImage(mask: CanvasImageSource, guide: Guide): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const { w, h } = guide;
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
    return null; // tainted mask — keep it unrefined
  }
  const px = img.data;
  const hard = new Float32Array(w * h);
  for (let i = 0, p = 0; i < hard.length; i++, p += 4) {
    hard[i] = (px[p]! * px[p + 3]!) / 65025; // red × alpha, as everywhere else
  }
  const q = guidedFilterAlpha(guide, hard, SNAP_RADIUS, SNAP_EPS);
  const alpha = snapAlpha(hard, q, w, h, SNAP_BAND_PX);
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const v = Math.round(alpha[i]! * 255);
    px[p] = v;
    px[p + 1] = v;
    px[p + 2] = v;
    px[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
