/**
 * Measures where each part of a drifted mask belongs, cell by cell.
 *
 * <p>A generative repaint does not drift by the same amount everywhere. On a real
 * facade the colour blocks can sit within a pixel of the windows halfway up the
 * wall while the parapet is 2% of the frame high and the boundary wall at the
 * bottom is 3% low. One whole-frame scale and offset cannot absorb that: it
 * splits the difference, pulling the parts that were already right off their
 * surfaces.
 *
 * <p>So the frame is divided into cells and each is re-measured on its OWN
 * boundaries. The question asked of a cell is the one a person asks by eye: slide
 * the mask's outline around a little, and see where it lands hardest on the
 * building's actual outline. That is what {@link edgeMap} builds — the photo's
 * gradient, blurred so each real edge has a basin a nearby candidate can fall
 * into — and what {@link autoFitLattice} searches.
 *
 * <p>This is the backend's {@code MaskAligner.localField} with two deliberate
 * differences, both of which come from a person being present:
 *
 * <ul>
 *   <li><b>Denser, and further.</b> The automatic pass runs 6 cells on the long
 *       side capped at 3% of the frame, because an unattended search that guesses
 *       wrong is worse than one that does nothing. Here the grid and the search
 *       radius are the operator's to set, and a wrong answer costs a drag to
 *       correct rather than a bad mask nobody sees.</li>
 *   <li><b>It reports rather than withholds.</b> The automatic pass throws the
 *       whole field away unless it clears a confidence bar. This returns what it
 *       measured along with WHY each cell got the answer it did, so the operator
 *       can see which cells were measured, which inherited from neighbours, and
 *       which had nothing under them at all.</li>
 * </ul>
 *
 * <p>Two rules are kept exactly, because they are not about confidence:
 *
 * <ul>
 *   <li>Cells stay welded into one interpolated field. Cells moved independently
 *       pull apart, and the gap between two regions renders as an unpainted white
 *       seam.</li>
 *   <li>A cell with nothing to measure takes its answer from its neighbours. A
 *       patch of sky that snaps to whatever noise it finds is worse than one that
 *       follows the roofline beside it.</li>
 * </ul>
 */

import {
  clampNode, displace, emptyLattice, latticeFolds, MAX_MANUAL_OFFSET,
  type Lattice, type Rigid,
} from "./mask-registration";

/** Longest side of the grid the photo's edges are measured on. Coarse on
 *  purpose: the drift being measured is whole-surface, not per-pixel, and a
 *  finer map costs time to find the same few pixels. */
export const EDGE_GRID = 256;

/** Gradient magnitudes at or above this percentile count as a full-strength
 *  edge. A percentile, not the maximum, so one blown-out highlight cannot
 *  flatten every architectural edge in the frame to nothing. */
const EDGE_PERCENTILE = 0.95;

/** At most this many boundary samples feed the whole measurement. Higher than
 *  the backend's 3000 because the grid here is denser and each cell needs
 *  enough of its own boundary to be measurable. */
const MAX_POINTS = 8000;

/** Boundary samples a cell needs before its own measurement is believed. Lower
 *  than the automatic pass's 40: the cells are smaller, so the same mask gives
 *  each one fewer points. */
const MIN_CELL_POINTS = 25;

/** A cell's move has to beat standing still by this factor. Below the automatic
 *  pass's 1.10 because a person is about to look at the result — the job here is
 *  to propose, not to decide unsupervised. */
const MIN_CELL_GAIN = 1.04;

/** ...and land on this much canvas edge in absolute terms. Without it a cell
 *  whose boundary sits on nothing could "gain" any factor at all by finding a
 *  marginally less empty spot. */
const MIN_CELL_SCORE = 0.03;

/**
 * How much a cell's score must fall when its winning placement is nudged one
 * step along an axis before that axis counts as measured, as a share of score.
 *
 * <p>This is the aperture problem, and ignoring it makes the field useless. A
 * cell holding only the horizontal underside of a slab says nothing about
 * horizontal drift — sliding it sideways leaves it on the same edge and scores
 * the same — so its answer of zero is not a measurement, it is the absence of
 * one. Recorded as such, the cell takes its horizontal answer from neighbours
 * that could see a vertical edge, instead of voting theirs down to nothing.
 */
const AXIS_MIN_DROP = 0.02;

/** Measured neighbours a cell needs before the neighbourhood median may replace
 *  its value. Below it there is no majority to be an outlier against. */
const MEDIAN_MIN_NEIGHBOURS = 2;

/** Passes of fold repair before giving up and clamping hard. */
const FOLD_REPAIR_PASSES = 24;

/** Why a cell holds the displacement it holds — what the bench paints back. */
export type CellStatus =
  /** Measured on its own boundary, both axes. */
  | "measured"
  /** Measured on one axis only; the other came from neighbours (aperture). */
  | "partial"
  /** Nothing measurable here — took its answer from the cells around it. */
  | "inherited"
  /** Too little of the mask's boundary fell in this cell to measure at all. */
  | "empty";

export interface CellReport {
  index: number;
  col: number;
  row: number;
  status: CellStatus;
  /** Boundary samples that landed in this cell. */
  points: number;
  /** Mean canvas-edge strength under this cell's boundary, after the move. */
  score: number;
  /** How much better that is than leaving the cell where it was. */
  gain: number;
  /** The displacement it ended up with, in shares of the frame. */
  du: number;
  dv: number;
}

export interface AutoFitResult {
  lattice: Lattice;
  cells: CellReport[];
  /** Mean edge score under the whole mask's boundary, before and after. */
  baseScore: number;
  score: number;
  /** True when the finished field had to be pulled back to stay unfoldable. */
  foldRepaired: boolean;
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The photo's gradient magnitude on a coarse grid, blurred and normalised.
 *
 * <p>The blur is what makes the search work at all. A bare gradient is a
 * one-pixel ridge, so every candidate that is not already exactly right scores
 * zero and there is no slope to walk down. Spreading it over a few pixels gives
 * each real edge a basin a nearby candidate can fall into.
 */
export function edgeMap(pixels: Uint8ClampedArray, gw: number, gh: number): Float32Array {
  const gray = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    const o = i * 4;
    gray[i] = 0.299 * pixels[o]! + 0.587 * pixels[o + 1]! + 0.114 * pixels[o + 2]!;
  }

  const mag = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const tl = gray[i - gw - 1]!, tc = gray[i - gw]!, tr = gray[i - gw + 1]!;
      const ml = gray[i - 1]!, mr = gray[i + 1]!;
      const bl = gray[i + gw - 1]!, bc = gray[i + gw]!, br = gray[i + gw + 1]!;
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      mag[i] = Math.hypot(dx, dy);
    }
  }

  const blurred = boxBlur(mag, gw, gh, 2);
  const sorted = Float32Array.from(blurred).sort();
  const ref = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * EDGE_PERCENTILE))]!;
  if (!(ref > 0)) return new Float32Array(gw * gh);
  for (let i = 0; i < blurred.length; i++) blurred[i] = Math.min(1, blurred[i]! / ref);
  return blurred;
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        if (nx < 0 || nx >= w) continue;
        sum += src[y * w + nx]!; n++;
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        if (ny < 0 || ny >= h) continue;
        sum += tmp[ny * w + x]!; n++;
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

/**
 * The mask's own category boundaries, as normalised points in its frame.
 *
 * <p>An even stride rather than a random sample: a boundary is traced in scan
 * order, so every stride keeps points from every wall instead of over-weighting
 * whichever one happens to be longest.
 */
export function boundaryPoints(labels: Uint8Array, lw: number, lh: number): Float32Array {
  if (lw < 8 || lh < 8) return new Float32Array(0);
  const found: number[] = [];
  for (let y = 1; y < lh - 1; y++) {
    for (let x = 1; x < lw - 1; x++) {
      const here = labels[y * lw + x]!;
      if (here === labels[y * lw + x + 1]! && here === labels[(y + 1) * lw + x]!) continue;
      found.push((x + 0.5) / lw, (y + 0.5) / lh);
    }
  }
  const n = found.length / 2;
  if (n === 0) return new Float32Array(0);
  const stride = Math.max(1, Math.floor(n / MAX_POINTS));
  const out: number[] = [];
  for (let k = 0; k < n; k += stride) out.push(found[2 * k]!, found[2 * k + 1]!);
  return Float32Array.from(out);
}

/** Mean canvas-edge strength under a set of boundary points. A point pushed off
 *  the frame contributes nothing but still counts against the average, so a
 *  placement that wins by shoving half the mask off-canvas loses. */
function scoreAt(
  idx: Int32Array, from: number, to: number,
  bu: Float32Array, bv: Float32Array, edges: Float32Array, gw: number, gh: number,
  du: number, dv: number,
): number {
  if (to <= from) return 0;
  let sum = 0;
  for (let k = from; k < to; k++) {
    const i = idx[k]!;
    const x = ((bu[i]! + du) * gw) | 0;
    const y = ((bv[i]! + dv) * gh) | 0;
    if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
    sum += edges[y * gw + x]!;
  }
  return sum / (to - from);
}

/** Candidate displacements as dx,dy step pairs, ordered by how far they move —
 *  so of two placements that score alike, the smaller move wins and a cell that
 *  is already right stays where it is. */
function offsetCandidates(radius: number): Int32Array {
  const side = 2 * radius + 1;
  const order: number[] = [];
  for (let i = 0; i < side * side; i++) order.push(i);
  order.sort((a, b) => {
    const ax = (a % side) - radius, ay = Math.floor(a / side) - radius;
    const bx = (b % side) - radius, by = Math.floor(b / side) - radius;
    return (ax * ax + ay * ay) - (bx * bx + by * by);
  });
  const out = new Int32Array(order.length * 2);
  for (let i = 0; i < order.length; i++) {
    out[2 * i] = (order[i]! % side) - radius;
    out[2 * i + 1] = Math.floor(order[i]! / side) - radius;
  }
  return out;
}

export interface AutoFitInput {
  /** The mask's classified labels and their grid. */
  labels: Uint8Array;
  lw: number;
  lh: number;
  /** The photo's edge map and its grid. */
  edges: Float32Array;
  gw: number;
  gh: number;
  /** The whole-frame placement the cells are measured on top of. */
  rigid: Rigid;
  cols: number;
  rows: number;
  /** How far a cell may move, in shares of the frame. */
  searchRadius: number;
}

/**
 * Measures every cell and returns the field that lines each part of the mask up,
 * along with what each cell's answer is worth.
 *
 * <p>Runs on top of {@code rigid} rather than replacing it: the whole-frame move
 * is what takes out the bulk of the drift, and measuring cells from where that
 * already put them is what keeps each cell's search small enough to be about its
 * own surface rather than a hunt across the frame.
 */
export function autoFitLattice(input: AutoFitInput): AutoFitResult {
  const { labels, lw, lh, edges, gw, gh, rigid, cols, rows, searchRadius } = input;
  const cells = cols * rows;
  const points = boundaryPoints(labels, lw, lh);
  const n = points.length / 2;

  const lattice = emptyLattice(cols, rows);
  const reports: CellReport[] = [];
  const blank = (): AutoFitResult => ({
    lattice, cells: reports, baseScore: 0, score: 0, foldRepaired: false,
  });
  if (n === 0) return blank();

  // Every boundary sample where the whole-frame placement puts it, and which
  // cell that is. Samples pushed off the canvas belong to no cell: they score
  // zero wherever they are moved, so they can only dilute a measurement.
  const bu = new Float32Array(n), bv = new Float32Array(n);
  const cellOf = new Int32Array(n), counts = new Int32Array(cells);
  for (let i = 0; i < n; i++) {
    const u = 0.5 + (points[2 * i]! - 0.5) * rigid.sx + rigid.ox;
    const v = 0.5 + (points[2 * i + 1]! - 0.5) * rigid.sy + rigid.oy;
    bu[i] = u; bv[i] = v;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) { cellOf[i] = -1; continue; }
    const c = Math.min(rows - 1, (v * rows) | 0) * cols + Math.min(cols - 1, (u * cols) | 0);
    cellOf[i] = c; counts[c] = counts[c]! + 1;
  }

  // Points regrouped per cell, counting-sort style, so a cell's search touches
  // only its own samples and allocates nothing per candidate.
  const start = new Int32Array(cells + 1);
  for (let c = 0; c < cells; c++) start[c + 1] = start[c]! + counts[c]!;
  const cursor = Int32Array.from(start);
  const byCell = new Int32Array(start[cells]!);
  for (let i = 0; i < n; i++) {
    const c = cellOf[i]!;
    if (c < 0) continue;
    byCell[cursor[c]!] = i;
    cursor[c] = cursor[c]! + 1;
  }

  const step = 1 / Math.max(gw, gh);
  const radiusSteps = Math.max(1, Math.round(searchRadius / step));
  const candidates = offsetCandidates(radiusSteps);

  const cellDu = new Float64Array(cells), cellDv = new Float64Array(cells);
  const knowsU = new Array<boolean>(cells).fill(false);
  const knowsV = new Array<boolean>(cells).fill(false);
  const status = new Array<CellStatus>(cells).fill("empty");
  const cellScore = new Float64Array(cells);
  const cellGain = new Float64Array(cells);

  for (let c = 0; c < cells; c++) {
    if (counts[c]! < MIN_CELL_POINTS) continue;
    const from = start[c]!, to = start[c + 1]!;
    const still = scoreAt(byCell, from, to, bu, bv, edges, gw, gh, 0, 0);
    const bar = Math.max(still * MIN_CELL_GAIN, MIN_CELL_SCORE);
    let best = still, bestDu = 0, bestDv = 0;
    for (let k = 0; k < candidates.length; k += 2) {
      const du = candidates[k]! * step, dv = candidates[k + 1]! * step;
      const sc = scoreAt(byCell, from, to, bu, bv, edges, gw, gh, du, dv);
      if (sc > best && sc >= bar) { best = sc; bestDu = du; bestDv = dv; }
    }
    cellScore[c] = best;
    cellGain[c] = still > 0 ? best / still : 1;

    // A cell that ends up sitting on nothing has not found its surface, it has
    // run out of frame; its answer is not evidence for anybody.
    if (best < MIN_CELL_SCORE) { status[c] = "inherited"; continue; }

    const uDrop = best - Math.min(
      scoreAt(byCell, from, to, bu, bv, edges, gw, gh, bestDu - step, bestDv),
      scoreAt(byCell, from, to, bu, bv, edges, gw, gh, bestDu + step, bestDv));
    const vDrop = best - Math.min(
      scoreAt(byCell, from, to, bu, bv, edges, gw, gh, bestDu, bestDv - step),
      scoreAt(byCell, from, to, bu, bv, edges, gw, gh, bestDu, bestDv + step));
    knowsU[c] = uDrop >= AXIS_MIN_DROP * best;
    knowsV[c] = vDrop >= AXIS_MIN_DROP * best;
    cellDu[c] = knowsU[c] ? bestDu : 0;
    cellDv[c] = knowsV[c] ? bestDv : 0;
    status[c] = knowsU[c] && knowsV[c] ? "measured"
      : knowsU[c] || knowsV[c] ? "partial"
      : "inherited";
  }

  // Outlier rejection before anything is filled in from these values: a cell
  // whose search locked onto some other surface's edge is replaced by the median
  // of itself and the neighbours that can see the same axis. A median, not an
  // average — on a coarse grid an average drags a wall that drifted left toward
  // the one beside it that drifted right until neither is corrected.
  medianFilter(cellDu, knowsU, cols, rows);
  medianFilter(cellDv, knowsV, cols, rows);

  // Cells blind on an axis follow the cells that could see it, spreading outward
  // one ring at a time — so a patch of sky takes the drift of the roofline under
  // it rather than the frame's average, which when one half of a facade went one
  // way and the other half the other is nobody's answer.
  diffuse(cellDu, knowsU.slice(), cols, rows, mean(cellDu, knowsU));
  diffuse(cellDv, knowsV.slice(), cols, rows, mean(cellDv, knowsV));

  // Cell values become lattice nodes: a node is the average of the cells meeting
  // at it, which is what turns a piecewise-constant grid into a continuous field
  // once the resampler interpolates between nodes.
  const stride = cols + 1;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      let su = 0, sv = 0, k = 0;
      for (let cj = j - 1; cj <= j; cj++) {
        for (let ci = i - 1; ci <= i; ci++) {
          if (ci < 0 || ci >= cols || cj < 0 || cj >= rows) continue;
          su += cellDu[cj * cols + ci]!; sv += cellDv[cj * cols + ci]!; k++;
        }
      }
      let nu = k === 0 ? 0 : su / k, nv = k === 0 ? 0 : sv / k;
      const mag = Math.hypot(nu, nv);
      if (mag > MAX_MANUAL_OFFSET) {
        nu *= MAX_MANUAL_OFFSET / mag;
        nv *= MAX_MANUAL_OFFSET / mag;
      }
      lattice.du[j * stride + i] = nu;
      lattice.dv[j * stride + i] = nv;
    }
  }

  const foldRepaired = repairFolds(lattice);

  for (let c = 0; c < cells; c++) {
    reports.push({
      index: c,
      col: c % cols,
      row: Math.floor(c / cols),
      status: status[c]!,
      points: counts[c]!,
      score: cellScore[c]!,
      gain: cellGain[c]!,
      du: cellDu[c]!,
      dv: cellDv[c]!,
    });
  }

  const baseScore = wholeScore(points, edges, gw, gh, rigid, null);
  const score = wholeScore(points, edges, gw, gh, rigid, lattice);
  return { lattice, cells: reports, baseScore, score, foldRepaired };
}

/** Mean canvas-edge strength under the whole mask's boundary — the number that
 *  says whether the finished field is better than what it replaced. */
export function wholeScore(
  points: Float32Array, edges: Float32Array, gw: number, gh: number,
  rigid: Rigid, lattice: Lattice | null,
): number {
  const n = points.length / 2;
  if (n === 0) return 0;
  const d: [number, number] = [0, 0];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let u = 0.5 + (points[2 * i]! - 0.5) * rigid.sx + rigid.ox;
    let v = 0.5 + (points[2 * i + 1]! - 0.5) * rigid.sy + rigid.oy;
    if (lattice) { displace(lattice, u, v, d); u += d[0]; v += d[1]; }
    const x = (u * gw) | 0, y = (v * gh) | 0;
    if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
    sum += edges[y * gw + x]!;
  }
  return sum / n;
}

/**
 * Pulls neighbouring nodes back together until the field cannot fold.
 *
 * <p>Each cell was judged alone, so two neighbours can disagree by more than the
 * cell between them is wide — and past that the resampling map doubles back and
 * the mask tears. Relaxation rather than a hard clamp, because the answer both
 * cells measured is closer to the truth than either would be if one were simply
 * cut back to the other: each gives up half the excess.
 *
 * @returns whether anything had to be pulled back
 */
function repairFolds(l: Lattice): boolean {
  const stride = l.cols + 1;
  let repaired = false;

  for (let pass = 0; pass < FOLD_REPAIR_PASSES; pass++) {
    if (!latticeFolds(l)) break;
    repaired = true;
    // A shade inside the bound, so a pass actually clears it rather than landing
    // exactly on it and leaving the check still true.
    const uLimit = (0.9 / l.cols) * 0.95;
    const vLimit = (0.9 / l.rows) * 0.95;

    for (let j = 0; j <= l.rows; j++) {
      for (let i = 0; i < l.cols; i++) {
        const a = j * stride + i, b = a + 1;
        const excess = l.du[b]! - l.du[a]! - uLimit;
        if (excess > 0) { l.du[b] = l.du[b]! - excess / 2; l.du[a] = l.du[a]! + excess / 2; }
      }
    }
    for (let i = 0; i <= l.cols; i++) {
      for (let j = 0; j < l.rows; j++) {
        const a = j * stride + i, b = a + stride;
        const excess = l.dv[b]! - l.dv[a]! - vLimit;
        if (excess > 0) { l.dv[b] = l.dv[b]! - excess / 2; l.dv[a] = l.dv[a]! + excess / 2; }
      }
    }
  }

  // Belt and braces: whatever relaxation left, hold every node to what a drag
  // could have reached, so the result is one the bench and the server both take.
  for (let j = 0; j <= l.rows; j++) {
    for (let i = 0; i <= l.cols; i++) {
      const idx = j * stride + i;
      const [du, dv] = clampNode(l, i, j, l.du[idx]!, l.dv[idx]!);
      if (du !== l.du[idx]! || dv !== l.dv[idx]!) repaired = true;
      l.du[idx] = du;
      l.dv[idx] = dv;
    }
  }
  return repaired;
}

function medianFilter(values: Float64Array, known: boolean[], cols: number, rows: number) {
  const src = Float64Array.from(values);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      if (!known[c]) continue;
      const win: number[] = [src[c]!];
      if (i > 0 && known[c - 1]) win.push(src[c - 1]!);
      if (i < cols - 1 && known[c + 1]) win.push(src[c + 1]!);
      if (j > 0 && known[c - cols]) win.push(src[c - cols]!);
      if (j < rows - 1 && known[c + cols]) win.push(src[c + cols]!);
      if (win.length - 1 < MEDIAN_MIN_NEIGHBOURS) continue;
      win.sort((a, b) => a - b);
      const k = win.length;
      values[c] = (k & 1) === 1 ? win[k >> 1]! : (win[(k >> 1) - 1]! + win[k >> 1]!) / 2;
    }
  }
}

function diffuse(
  values: Float64Array, known: boolean[], cols: number, rows: number, fallback: number,
) {
  const cells = cols * rows;
  for (let ring = 0; ring < cols + rows; ring++) {
    let progressed = false;
    const next = Float64Array.from(values), nextKnown = known.slice();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const c = j * cols + i;
        if (known[c]) continue;
        let sum = 0, k = 0;
        if (i > 0 && known[c - 1]) { sum += values[c - 1]!; k++; }
        if (i < cols - 1 && known[c + 1]) { sum += values[c + 1]!; k++; }
        if (j > 0 && known[c - cols]) { sum += values[c - cols]!; k++; }
        if (j < rows - 1 && known[c + cols]) { sum += values[c + cols]!; k++; }
        if (k === 0) continue;
        next[c] = sum / k; nextKnown[c] = true; progressed = true;
      }
    }
    values.set(next);
    for (let i = 0; i < cells; i++) known[i] = nextKnown[i]!;
    if (!progressed) break;
  }
  for (let c = 0; c < cells; c++) if (!known[c]) values[c] = fallback;
}

function mean(values: Float64Array, known: boolean[]): number {
  let sum = 0, k = 0;
  for (let i = 0; i < values.length; i++) if (known[i]) { sum += values[i]!; k++; }
  return k === 0 ? 0 : sum / k;
}
