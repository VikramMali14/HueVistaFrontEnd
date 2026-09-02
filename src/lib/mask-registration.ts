/**
 * The geometry behind the align bench: where a colour-coded mask sits on its
 * canvas, and what a person is allowed to move it to.
 *
 * Pure (numbers and typed arrays in, typed arrays out) so every rule here is
 * unit-testable without a canvas — which matters more than usual, because these
 * functions are a PORT. Their job is to agree with the backend's MaskAligner and
 * MaskProcessor exactly:
 *
 *  - `classify` must bucket a pixel the way MaskProcessor.classify does, or the
 *    surface somebody lines up is not the surface that gets stored.
 *  - `displace` must interpolate the way MaskAligner.Warp does, or the preview
 *    and the result agree on the lattice nodes and nowhere between them.
 *  - `clampNode` must be at least as strict as MaskAligner.Warp.of, or the bench
 *    lets somebody compose a registration the server then refuses — after the
 *    five minutes of placement, which is the worst moment to learn about a cap.
 *
 * The forward convention, per axis, both frames normalised to 0..1 of their own
 * size:
 *
 *     u_canvas = 0.5 + (u_mask − 0.5) · scale + offset   [ + warp there ]
 *
 * and the resampler runs it backwards, which is what `inverseU` below is.
 */

/** Category bytes, matching MaskProcessor's. */
export const NONE = 0, MAIN = 1, ACCENT = 2, TRIM = 3, WHITE = 4;

/* Limits mirrored from MaskAligner's manual-registration constants. */
export const MAX_MANUAL_OFFSET = 0.3;
export const MIN_MANUAL_SCALE = 0.5;
export const MAX_MANUAL_SCALE = 2.0;
export const FOLD_MARGIN = 0.9;

/**
 * A little inside the server's fold margin rather than exactly on it.
 *
 * The server rejects a lattice whose neighbouring nodes differ by
 * `FOLD_MARGIN / cols` or more; clamping to precisely that bound would leave the
 * bench composing values that land on the boundary, where a float rounding the
 * wrong way at the edge is the difference between "applied" and "rejected after
 * five minutes of work". A hair inside costs nothing anybody can see.
 */
const CLIENT_FOLD_SLACK = 0.98;

export interface Lattice {
  cols: number;
  rows: number;
  du: Float64Array;
  dv: Float64Array;
}

export interface Rigid {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

export const IDENTITY: Rigid = { sx: 1, sy: 1, ox: 0, oy: 0 };

/**
 * MaskProcessor.classify, ported.
 *
 * The anti-aliasing rule at the bottom is the one that earns its place: JPEG and
 * resampling soften every border between two colour blocks into a mix — magenta
 * where red meets blue, yellow where red meets green — which is bright and
 * clearly chromatic but fails every dominance test above. Dropping those pixels
 * leaves an unassigned ribbon along each border that renders as an unpainted
 * seam, so they are adopted into the strongest channel's category instead.
 */
export function classify(r: number, g: number, b: number): number {
  if (r >= g + 40 && r >= b + 40 && r >= 100) return MAIN;
  if (g >= r + 40 && g >= b + 40 && g >= 100) return ACCENT;
  if (b >= r + 40 && b >= g + 40 && b >= 100) return TRIM;
  const min = Math.min(r, g, b), max = Math.max(r, g, b);
  if (min >= 170 && max - min <= 50) return WHITE;
  if (max >= 100 && max - min >= 40) {
    if (r >= g && r >= b) return MAIN;
    return g >= b ? ACCENT : TRIM;
  }
  return NONE;
}

export const emptyLattice = (cols: number, rows: number): Lattice => ({
  cols,
  rows,
  du: new Float64Array((cols + 1) * (rows + 1)),
  dv: new Float64Array((cols + 1) * (rows + 1)),
});

/** Whether anybody has actually moved a node. A lattice of zeroes is not worth
 *  sending: it makes the backend resample through a field that does nothing and
 *  file a registration claiming a local correction was needed when none was. */
export const latticeMoved = (l: Lattice | null): boolean =>
  !!l && l.du.some((d, i) => Math.hypot(d, l.dv[i]!) > 1e-6);

/** The largest node displacement, as a share of the frame. */
export function maxShift(l: Lattice): number {
  let m = 0;
  for (let i = 0; i < l.du.length; i++) m = Math.max(m, Math.hypot(l.du[i]!, l.dv[i]!));
  return m;
}

/** The displacement at canvas point (u,v), bilinear between lattice nodes —
 *  MaskAligner.Warp.displace, ported. Outside the frame the nearest edge of the
 *  lattice is held, so a sample just off-canvas does not fly off on an
 *  extrapolated slope. */
export function displace(l: Lattice, u: number, v: number, out: [number, number]): void {
  const fu = Math.min(l.cols, Math.max(0, u * l.cols));
  const fv = Math.min(l.rows, Math.max(0, v * l.rows));
  const i0 = Math.min(l.cols - 1, Math.floor(fu));
  const j0 = Math.min(l.rows - 1, Math.floor(fv));
  const tu = fu - i0, tv = fv - j0, stride = l.cols + 1;
  const a = j0 * stride + i0, b = a + 1, c = a + stride, d = c + 1;
  out[0] = (l.du[a]! * (1 - tu) + l.du[b]! * tu) * (1 - tv) + (l.du[c]! * (1 - tu) + l.du[d]! * tu) * tv;
  out[1] = (l.dv[a]! * (1 - tu) + l.dv[b]! * tu) * (1 - tv) + (l.dv[c]! * (1 - tu) + l.dv[d]! * tu) * tv;
}

/**
 * Re-samples a lattice onto a different grid, so changing the density keeps the
 * work already done.
 *
 * Without it, "I need one more row across the parapet" would mean placing the
 * whole thing again — which in practice means people leave the grid too coarse
 * to fix what they opened the bench for.
 */
export function resampleLattice(from: Lattice, cols: number, rows: number): Lattice {
  const next = emptyLattice(cols, rows);
  const out: [number, number] = [0, 0];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      displace(from, i / cols, j / rows, out);
      next.du[j * (cols + 1) + i] = out[0];
      next.dv[j * (cols + 1) + i] = out[1];
    }
  }
  return next;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Where node (i,j) is allowed to end up.
 *
 * <p>The absolute bound is the server's cap on a single node. The neighbour
 * bounds are the fold guard, and they are why dragging feels like it hits a wall
 * instead of tearing the mask.
 *
 * <p>The resampler runs the map backwards — `u_mask = 0.5 + (u − du(u) − 0.5 −
 * offset) / scale` — so it stays a function of the canvas only while `u − du(u)`
 * keeps increasing. Across one cell `du` changes by the difference between two
 * adjacent nodes over a width of `1/cols`, so the map folds the moment that
 * difference reaches `1/cols`: the mask doubles back and a wall appears twice
 * with a tear between the copies. That failure is invisible afterwards — the
 * stored PNG decodes perfectly and simply has the wall in it twice — so it is
 * stopped at the only moment anybody can see it, which is the drag.
 */
export function clampNode(
  l: Lattice, i: number, j: number, du: number, dv: number,
): [number, number] {
  const stride = l.cols + 1;
  const uLimit = (FOLD_MARGIN / l.cols) * CLIENT_FOLD_SLACK;
  const vLimit = (FOLD_MARGIN / l.rows) * CLIENT_FOLD_SLACK;

  let uLo = -MAX_MANUAL_OFFSET, uHi = MAX_MANUAL_OFFSET;
  if (i > 0) uHi = Math.min(uHi, l.du[j * stride + i - 1]! + uLimit);
  if (i < l.cols) uLo = Math.max(uLo, l.du[j * stride + i + 1]! - uLimit);
  let outU = clamp(du, Math.min(uLo, uHi), Math.max(uLo, uHi));

  let vLo = -MAX_MANUAL_OFFSET, vHi = MAX_MANUAL_OFFSET;
  if (j > 0) vHi = Math.min(vHi, l.dv[(j - 1) * stride + i]! + vLimit);
  if (j < l.rows) vLo = Math.max(vLo, l.dv[(j + 1) * stride + i]! - vLimit);
  let outV = clamp(dv, Math.min(vLo, vHi), Math.max(vLo, vHi));

  // The server's cap is on the node's DISTANCE, not on each axis, so bounding
  // the two independently is not enough: a node dragged to the corner sits at
  // 0.3 on both axes and 0.42 away, which the server refuses. Pull it back along
  // its own direction — that keeps the drag going where the pointer went instead
  // of sliding it sideways — then re-apply the fold bounds, which the shrink
  // could otherwise have stepped outside of.
  const mag = Math.hypot(outU, outV);
  if (mag > MAX_MANUAL_OFFSET) {
    const k = MAX_MANUAL_OFFSET / mag;
    outU = clamp(outU * k, Math.min(uLo, uHi), Math.max(uLo, uHi));
    outV = clamp(outV * k, Math.min(vLo, vHi), Math.max(vLo, vHi));
  }

  return [outU, outV];
}

/**
 * Whether this lattice is one the server will take: no fold, and no node past
 * the distance cap.
 *
 * <p>{@link clampNode} keeps a drag inside both, and for any placement a pointer
 * can actually reach that is the end of it. The one case it cannot promise is a
 * node whose neighbours have themselves been dragged to the caps on a fine grid,
 * where the fold bounds can force a value the distance cap would not choose. It
 * is a corner nobody reaches by accident, and the honest response to it is to say
 * so before sending rather than to have the server say it afterwards.
 */
export function latticeWithinCaps(l: Lattice): boolean {
  if (latticeFolds(l)) return false;
  return maxShift(l) <= MAX_MANUAL_OFFSET + 1e-9;
}

/**
 * Whether this lattice would survive MaskAligner.Warp.of — the same two checks,
 * so the bench can refuse to send rather than let the server refuse to take.
 */
export function latticeFolds(l: Lattice): boolean {
  const stride = l.cols + 1;
  const uLimit = FOLD_MARGIN / l.cols;
  const vLimit = FOLD_MARGIN / l.rows;
  for (let j = 0; j <= l.rows; j++) {
    for (let i = 0; i < l.cols; i++) {
      if (l.du[j * stride + i + 1]! - l.du[j * stride + i]! >= uLimit) return true;
    }
  }
  for (let i = 0; i <= l.cols; i++) {
    for (let j = 0; j < l.rows; j++) {
      if (l.dv[(j + 1) * stride + i]! - l.dv[j * stride + i]! >= vLimit) return true;
    }
  }
  return false;
}

/**
 * The inverse map the preview draws through, and the one MaskProcessor resamples
 * through: canvas point → the point of the mask that lands there.
 *
 * Returns null when the registration pulls this canvas pixel from outside the
 * mask's frame, which is background — a mask a fit pushes partly off-canvas
 * loses that sliver rather than smearing its edge pixel across the gap.
 */
export function inverseUV(
  rigid: Rigid, lattice: Lattice | null, u0: number, v0: number,
  out: [number, number],
): boolean {
  let du = 0, dv = 0;
  if (lattice) {
    const d: [number, number] = [0, 0];
    displace(lattice, u0, v0, d);
    du = d[0]; dv = d[1];
  }
  const u = 0.5 + (u0 - du - 0.5 - rigid.ox) / rigid.sx;
  const v = 0.5 + (v0 - dv - 0.5 - rigid.oy) / rigid.sy;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  out[0] = u; out[1] = v;
  return true;
}

/**
 * How far apart the coordinate rulers' labelled lines should be, in canvas
 * pixels, for a canvas of {@code canvasPx} across shown {@code displayPx} wide
 * at {@code zoom}.
 *
 * <p>A fixed interval fails at both ends: 100px on a 2000px canvas is twenty
 * readable lines at 1x and a hundred and sixty overlapping ones at 8x. So it
 * steps through the intervals people actually read in and takes the first that
 * leaves labels far enough apart, which keeps the rulers legible at every zoom
 * without the numbers on them changing meaning.
 */
export function rulerInterval(canvasPx: number, displayPx: number, zoom: number): number {
  const steps = [25, 50, 100, 250, 500, 1000, 2500];
  const MIN_LABEL_GAP_PX = 70;
  if (!(canvasPx > 0) || !(displayPx > 0) || !(zoom > 0)) return steps[steps.length - 1]!;
  const perCanvasPx = (displayPx * zoom) / canvasPx;
  return steps.find((s) => s * perCanvasPx >= MIN_LABEL_GAP_PX) ?? steps[steps.length - 1]!;
}
