import { describe, expect, it } from "vitest";
import {
  ACCENT, FOLD_MARGIN, IDENTITY, MAIN, MAX_MANUAL_OFFSET, NONE, TRIM, WHITE,
  classify, clampNode, displace, emptyLattice, inverseUV, latticeFolds, latticeMoved,
  latticeWithinCaps, maxShift, resampleLattice, type Lattice, type Rigid,
} from "../mask-registration";

/**
 * These are the rules the align bench places masks by, and every one of them is
 * a PORT of something in the backend. So the tests are mostly about agreement:
 * a bench that clamps looser than the server lets somebody spend five minutes
 * placing a registration the server then refuses, and a bench that classifies
 * pixels differently lines up a surface that is not the one which gets stored.
 */

const at = (l: Lattice, i: number, j: number) => j * (l.cols + 1) + i;

describe("classify", () => {
  it("buckets the palette the model was asked for", () => {
    expect(classify(255, 0, 0)).toBe(MAIN);
    expect(classify(0, 255, 0)).toBe(ACCENT);
    expect(classify(0, 0, 255)).toBe(TRIM);
  });

  it("leaves the model's 'everything else' unassigned", () => {
    expect(classify(0, 0, 0)).toBe(NONE);
    expect(classify(20, 22, 19)).toBe(NONE);
  });

  it("keeps a near-white surface as the accent fallback rather than dropping it", () => {
    // The model paints an already-white accent wall white again; the split
    // adopts a large near-white area instead of collapsing to main + trim.
    expect(classify(240, 238, 235)).toBe(WHITE);
  });

  it("adopts a softened border pixel into the strongest channel", () => {
    // Magenta on a red|blue border: bright, clearly chromatic, and failing every
    // dominance test. Dropping these leaves an unpainted seam between regions,
    // so each goes to whichever channel is actually strongest.
    expect(classify(200, 30, 190)).toBe(MAIN);   // red edges blue out
    expect(classify(30, 120, 200)).toBe(TRIM);   // blue wins over green
    expect(classify(30, 200, 190)).toBe(ACCENT); // green wins over blue
    expect(classify(210, 190, 30)).toBe(MAIN);   // yellow on a red|green border
  });

  it("still refuses a grey — a railing is not a wall", () => {
    expect(classify(130, 132, 129)).toBe(NONE);
  });
});

describe("displace", () => {
  it("reads a node's own value at that node", () => {
    const l = emptyLattice(2, 2);
    l.du[at(l, 1, 1)] = 0.05;
    l.dv[at(l, 1, 1)] = -0.02;
    const out: [number, number] = [0, 0];
    displace(l, 0.5, 0.5, out);
    expect(out[0]).toBeCloseTo(0.05, 10);
    expect(out[1]).toBeCloseTo(-0.02, 10);
  });

  it("interpolates linearly between two nodes", () => {
    const l = emptyLattice(2, 2);
    l.du[at(l, 1, 0)] = 0.1;
    const out: [number, number] = [0, 0];
    displace(l, 0.25, 0, out);
    expect(out[0]).toBeCloseTo(0.05, 10);
  });

  it("holds the nearest edge outside the frame rather than extrapolating", () => {
    const l = emptyLattice(2, 2);
    l.du[at(l, 0, 0)] = 0.07;
    const out: [number, number] = [0, 0];
    displace(l, -3, -3, out);
    expect(out[0]).toBeCloseTo(0.07, 10);
  });
});

describe("clampNode", () => {
  it("lets a node move freely when its neighbours are at rest", () => {
    const l = emptyLattice(6, 6);
    const [du, dv] = clampNode(l, 3, 3, 0.02, -0.03);
    expect(du).toBeCloseTo(0.02, 10);
    expect(dv).toBeCloseTo(-0.03, 10);
  });

  it("holds a node inside the server's absolute cap", () => {
    const l = emptyLattice(2, 2);
    const [du, dv] = clampNode(l, 1, 1, 5, -5);
    expect(du).toBeLessThanOrEqual(MAX_MANUAL_OFFSET);
    expect(dv).toBeGreaterThanOrEqual(-MAX_MANUAL_OFFSET);
  });

  /**
   * The one that matters. A person dragging one node past its neighbour folds
   * the sampling map, and the damage is invisible afterwards — the stored PNG
   * decodes perfectly and has the same wall in it twice. So dragging has to hit
   * a wall, and the proof is that no reachable placement folds.
   */
  it("never lets a drag compose a lattice the server would reject", () => {
    const l = emptyLattice(4, 6);
    const stride = l.cols + 1;

    // Drag every node, hard, in every direction — the worst a pointer can do.
    const pulls = [-9, -0.4, -0.05, 0.05, 0.4, 9];
    for (let j = 0; j <= l.rows; j++) {
      for (let i = 0; i <= l.cols; i++) {
        for (const du of pulls) {
          for (const dv of pulls) {
            const [nu, nv] = clampNode(l, i, j, du, dv);
            l.du[j * stride + i] = nu;
            l.dv[j * stride + i] = nv;
            expect(latticeFolds(l)).toBe(false);
          }
        }
      }
    }
    expect(maxShift(l)).toBeLessThanOrEqual(MAX_MANUAL_OFFSET + 1e-9);
    expect(latticeWithinCaps(l)).toBe(true);
  });

  it("pulls a corner drag back along its own direction, not sideways", () => {
    // Both axes clamp to 0.3 independently, which is 0.42 away — past the cap the
    // server measures. The node has to come back, and it has to come back along
    // the diagonal it was dragged down.
    const l = emptyLattice(4, 4);
    const [du, dv] = clampNode(l, 2, 2, 9, 9);
    expect(Math.hypot(du, dv)).toBeLessThanOrEqual(MAX_MANUAL_OFFSET + 1e-9);
    expect(du).toBeCloseTo(dv, 9);
  });

  it("clamps strictly inside the server's fold bound, not onto it", () => {
    const l = emptyLattice(4, 4);
    const [du] = clampNode(l, 1, 0, 99, 0);
    // Neighbour at rest, so the reachable bound is the fold limit itself.
    expect(du).toBeLessThan(FOLD_MARGIN / l.cols);
  });
});

describe("resampleLattice", () => {
  it("keeps the field's shape when the grid density changes", () => {
    const from = emptyLattice(2, 2);
    from.du[at(from, 1, 1)] = 0.08;

    const to = resampleLattice(from, 4, 4);
    expect(to.cols).toBe(4);
    expect(to.rows).toBe(4);
    // The centre node of the finer grid sits where the moved node was.
    expect(to.du[at(to, 2, 2)]).toBeCloseTo(0.08, 10);
    // And a node halfway between centre and edge carries half of it.
    expect(to.du[at(to, 1, 2)]).toBeCloseTo(0.04, 10);
  });

  it("survives a round trip through a coarser grid without inventing drift", () => {
    const flat = emptyLattice(6, 6);
    const there = resampleLattice(flat, 3, 3);
    const back = resampleLattice(there, 6, 6);
    expect(maxShift(back)).toBe(0);
  });
});

describe("latticeMoved", () => {
  it("is false for a lattice nobody touched", () => {
    expect(latticeMoved(emptyLattice(4, 4))).toBe(false);
    expect(latticeMoved(null)).toBe(false);
  });

  it("is true as soon as one node carries a real displacement", () => {
    const l = emptyLattice(4, 4);
    l.dv[at(l, 2, 2)] = 0.01;
    expect(latticeMoved(l)).toBe(true);
  });
});

describe("inverseUV", () => {
  it("is the identity when nothing was moved", () => {
    const out: [number, number] = [0, 0];
    expect(inverseUV(IDENTITY, null, 0.3, 0.7, out)).toBe(true);
    expect(out[0]).toBeCloseTo(0.3, 10);
    expect(out[1]).toBeCloseTo(0.7, 10);
  });

  it("undoes the forward convention exactly", () => {
    const rigid: Rigid = { sx: 1.04, sy: 0.97, ox: 0.02, oy: -0.015 };
    const uMask = 0.42, vMask = 0.61;
    // Forward, as the backend states it.
    const uCanvas = 0.5 + (uMask - 0.5) * rigid.sx + rigid.ox;
    const vCanvas = 0.5 + (vMask - 0.5) * rigid.sy + rigid.oy;

    const out: [number, number] = [0, 0];
    expect(inverseUV(rigid, null, uCanvas, vCanvas, out)).toBe(true);
    expect(out[0]).toBeCloseTo(uMask, 10);
    expect(out[1]).toBeCloseTo(vMask, 10);
  });

  it("reports a canvas pixel the registration pulls from off the mask", () => {
    const rigid: Rigid = { sx: 1, sy: 1, ox: 0.3, oy: 0 };
    const out: [number, number] = [0, 0];
    // Far left of the canvas, with the mask pushed right: nothing there.
    expect(inverseUV(rigid, null, 0.01, 0.5, out)).toBe(false);
  });
});
