import { describe, expect, it } from "vitest";
import {
  autoFitLattice, boundaryPoints, edgeMap, wholeScore,
} from "../mask-autofit";
import {
  IDENTITY, MAIN, MAX_MANUAL_OFFSET, NONE, TRIM, displace, latticeFolds, latticeWithinCaps,
  type Lattice,
} from "../mask-registration";

/**
 * The auto-fit is judged on the OUTCOME, not on the numbers it reports: what
 * matters is that the mask ends up over the surface the photo actually has. So
 * these build a synthetic facade, drift a mask off it by a known amount — a
 * different amount in different parts of the frame, which is the whole point —
 * and check the field puts it back.
 *
 * A test on the raw displacements would pass or fail on the search's step size
 * instead of on whether the mask landed.
 */

const W = 240, H = 180;

/** A "photo": two bright blocks on a dark ground, so there are real edges to
 *  measure against. The upper block will be drifted one way, the lower another. */
function buildPhoto(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    px[o] = 25; px[o + 1] = 28; px[o + 2] = 32; px[o + 3] = 255;
  }
  const put = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * W + x) * 4;
        px[o] = v; px[o + 1] = v; px[o + 2] = v;
      }
    }
  };
  put(40, 20, 200, 80, 230);    // upper block
  put(40, 100, 200, 160, 195);  // lower block
  return px;
}

/** A mask over the same two blocks, each shifted by its own amount. */
function buildMaskLabels(
  lw: number, lh: number,
  upper: { dx: number; dy: number }, lower: { dx: number; dy: number },
): Uint8Array {
  const labels = new Uint8Array(lw * lh);
  const fill = (x0: number, y0: number, x1: number, y1: number, cat: number, d: { dx: number; dy: number }) => {
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const u = (x + 0.5) / lw - d.dx;
        const v = (y + 0.5) / lh - d.dy;
        const px = u * W, py = v * H;
        if (px >= x0 && px < x1 && py >= y0 && py < y1) labels[y * lw + x] = cat;
      }
    }
  };
  fill(40, 20, 200, 80, MAIN, upper);
  fill(40, 100, 200, 160, TRIM, lower);
  return labels;
}

function fitFor(upper: { dx: number; dy: number }, lower: { dx: number; dy: number }) {
  const lw = 240, lh = 180;
  const labels = buildMaskLabels(lw, lh, upper, lower);
  const edges = edgeMap(buildPhoto(), W, H);
  return {
    labels, lw, lh, edges,
    result: autoFitLattice({
      labels, lw, lh, edges, gw: W, gh: H,
      rigid: IDENTITY, cols: 4, rows: 3, searchRadius: 0.06,
    }),
  };
}

describe("edgeMap", () => {
  it("lights up on a real edge and stays dark on flat ground", () => {
    const edges = edgeMap(buildPhoto(), W, H);
    const at = (x: number, y: number) => edges[y * W + x]!;
    // The top edge of the upper block, against the middle of it.
    expect(at(120, 20)).toBeGreaterThan(0.5);
    expect(at(120, 50)).toBeLessThan(0.1);
  });

  it("returns a flat map for a photo with nothing in it", () => {
    const blank = new Uint8ClampedArray(W * H * 4).fill(120);
    const edges = edgeMap(blank, W, H);
    expect(edges.every((e) => e === 0)).toBe(true);
  });
});

describe("boundaryPoints", () => {
  it("traces the border between two categories and skips the interior", () => {
    const labels = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) labels[y * 64 + x] = MAIN;
    const pts = boundaryPoints(labels, 64, 64);
    expect(pts.length).toBeGreaterThan(0);
    // Every traced point sits near the vertical border at u = 0.5.
    for (let i = 0; i < pts.length / 2; i++) {
      expect(Math.abs(pts[2 * i]! - 0.5)).toBeLessThan(0.05);
    }
  });

  it("finds nothing in a mask of one flat category", () => {
    expect(boundaryPoints(new Uint8Array(64 * 64).fill(NONE), 64, 64).length).toBe(0);
  });
});

describe("autoFitLattice", () => {
  it("lands a mask that drifted uniformly back on its blocks", () => {
    const drift = { dx: 0.03, dy: 0.02 };
    const { result } = fitFor(drift, drift);
    expect(result.score).toBeGreaterThan(result.baseScore);
  });

  /**
   * The case the whole feature exists for: two surfaces that drifted in opposite
   * directions. No single scale and offset can land both, so a whole-frame fit
   * splits the difference and a per-cell field should beat it decisively.
   */
  it("corrects two surfaces that drifted opposite ways", () => {
    const { result } = fitFor({ dx: 0.035, dy: 0.025 }, { dx: -0.035, dy: -0.025 });
    expect(result.score).toBeGreaterThan(result.baseScore * 1.3);

    // And the field it found genuinely disagrees across the frame, rather than
    // settling on one average nudge.
    const top: [number, number] = [0, 0];
    const bottom: [number, number] = [0, 0];
    displace(result.lattice, 0.5, 0.15, top);
    displace(result.lattice, 0.5, 0.85, bottom);
    expect(Math.sign(top[0])).not.toBe(Math.sign(bottom[0]));
  });

  it("always returns a field the bench and the server both accept", () => {
    const { result } = fitFor({ dx: 0.05, dy: 0.04 }, { dx: -0.05, dy: -0.04 });
    expect(latticeFolds(result.lattice)).toBe(false);
    expect(latticeWithinCaps(result.lattice)).toBe(true);
  });

  it("reports why each cell holds what it holds", () => {
    const { result } = fitFor({ dx: 0.03, dy: 0.02 }, { dx: -0.03, dy: -0.02 });
    expect(result.cells).toHaveLength(12);
    for (const c of result.cells) {
      expect(["measured", "partial", "inherited", "empty"]).toContain(c.status);
      expect(c.points).toBeGreaterThanOrEqual(0);
    }
    // Something in this frame must actually have been measurable.
    expect(result.cells.some((c) => c.status === "measured" || c.status === "partial")).toBe(true);
  });

  it("leaves a mask alone when there is nothing in the photo to measure against", () => {
    const lw = 240, lh = 180;
    const labels = buildMaskLabels(lw, lh, { dx: 0.03, dy: 0 }, { dx: 0.03, dy: 0 });
    const flat = edgeMap(new Uint8ClampedArray(W * H * 4).fill(120), W, H);
    const result = autoFitLattice({
      labels, lw, lh, edges: flat, gw: W, gh: H,
      rigid: IDENTITY, cols: 4, rows: 3, searchRadius: 0.06,
    });
    // No edge anywhere means no cell clears MIN_CELL_SCORE, so nothing moves.
    for (const c of result.cells) expect(c.status).not.toBe("measured");
    expect(maxNode(result.lattice)).toBe(0);
  });

  it("handles a mask with no boundary at all without throwing", () => {
    const result = autoFitLattice({
      labels: new Uint8Array(64 * 64), lw: 64, lh: 64,
      edges: edgeMap(buildPhoto(), W, H), gw: W, gh: H,
      rigid: IDENTITY, cols: 3, rows: 3, searchRadius: 0.05,
    });
    expect(result.cells).toHaveLength(0);
    expect(maxNode(result.lattice)).toBe(0);
  });

  it("never proposes a node past the cap the server enforces", () => {
    const { result } = fitFor({ dx: 0.09, dy: 0.09 }, { dx: -0.09, dy: -0.09 });
    expect(maxNode(result.lattice)).toBeLessThanOrEqual(MAX_MANUAL_OFFSET + 1e-9);
  });
});

describe("wholeScore", () => {
  it("rises when the mask is put back where the photo's edges are", () => {
    const drift = { dx: 0.03, dy: 0.02 };
    const { labels, lw, lh, edges, result } = fitFor(drift, drift);
    const pts = boundaryPoints(labels, lw, lh);
    const before = wholeScore(pts, edges, W, H, IDENTITY, null);
    const after = wholeScore(pts, edges, W, H, IDENTITY, result.lattice);
    expect(after).toBeGreaterThan(before);
  });
});

function maxNode(l: Lattice): number {
  let m = 0;
  for (let i = 0; i < l.du.length; i++) m = Math.max(m, Math.hypot(l.du[i]!, l.dv[i]!));
  return m;
}
