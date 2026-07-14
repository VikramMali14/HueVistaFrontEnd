import { describe, expect, it } from "vitest";
import { guidedFilterAlpha, snapAlpha, type Guide } from "../mask-refine";

/** Build a synthetic guide image from a per-pixel colour function. */
function makeGuide(w: number, h: number, at: (x: number, y: number) => [number, number, number]): Guide {
  const R = new Float32Array(w * h);
  const G = new Float32Array(w * h);
  const B = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y);
      R[y * w + x] = r;
      G[y * w + x] = g;
      B[y * w + x] = b;
    }
  }
  return { w, h, ch: [R, G, B] };
}

function makeMask(w: number, h: number, inside: (x: number, y: number) => boolean): Float32Array {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) m[y * w + x] = inside(x, y) ? 1 : 0;
  }
  return m;
}

/** x of the first pixel below 0.5 scanning a row left → right (the edge). */
function crossing(alpha: Float32Array, w: number, y: number): number {
  for (let x = 0; x < w; x++) {
    if (alpha[y * w + x]! < 0.5) return x;
  }
  return w;
}

const W = 80;
const H = 40;
const RADIUS = 6;
const EPS = 2e-4;
const BAND = 4;

// A wall/sky photo: warm beige left of x = 40, blue sky right of it.
const wallSky = makeGuide(W, H, (x) => (x < 40 ? [0.85, 0.8, 0.7] : [0.55, 0.65, 0.9]));

describe("edge snapping (guided mask refinement)", () => {
  it("moves a misregistered mask boundary onto the photo's real edge", () => {
    // The AI mask overshoots the wall by 3px (paint would sit on the sky).
    const mask = makeMask(W, H, (x) => x < 43);
    const q = guidedFilterAlpha(wallSky, mask, RADIUS, EPS);
    const alpha = snapAlpha(mask, q, W, H, BAND);
    for (let y = 8; y < H - 8; y += 4) {
      expect(Math.abs(crossing(alpha, W, y) - 40)).toBeLessThanOrEqual(1);
    }
  });

  it("also pulls an undershooting mask out to the real edge", () => {
    // The mask stops 3px short of the wall/sky line (an unpainted sliver).
    const mask = makeMask(W, H, (x) => x < 37);
    const alpha = snapAlpha(mask, guidedFilterAlpha(wallSky, mask, RADIUS, EPS), W, H, BAND);
    for (let y = 8; y < H - 8; y += 4) {
      expect(Math.abs(crossing(alpha, W, y) - 40)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps deep interior and far exterior binary", () => {
    const mask = makeMask(W, H, (x) => x < 43);
    const alpha = snapAlpha(mask, guidedFilterAlpha(wallSky, mask, RADIUS, EPS), W, H, BAND);
    const y = 20;
    expect(alpha[y * W + 10]).toBe(1); // well inside
    expect(alpha[y * W + 70]).toBe(0); // well outside
  });

  it("cannot move an edge beyond the snap band", () => {
    // The photo edge sits 12px away from the mask boundary — far outside the
    // band. Snapping must NOT migrate the region onto the other surface.
    const mask = makeMask(W, H, (x) => x < 52);
    const alpha = snapAlpha(mask, guidedFilterAlpha(wallSky, mask, RADIUS, EPS), W, H, BAND);
    const y = 20;
    // Beyond the band around the mask boundary, the hard mask wins outright.
    expect(alpha[y * W + 52 + BAND + 1]).toBe(0);
    expect(alpha[y * W + 52 - BAND - 2]).toBe(1);
  });

  it("keeps a tight boundary where the photo has no edge at all", () => {
    // Uniform wall: the mask boundary is an arbitrary line on a flat surface
    // (e.g. main wall vs accent wall painted the same colour). The guided
    // alpha is a wide ramp there; the steepen + band clamp must keep the
    // transition within the band instead of smearing over the filter radius.
    const flat = makeGuide(W, H, () => [0.8, 0.78, 0.74]);
    const mask = makeMask(W, H, (x) => x < 40);
    const alpha = snapAlpha(mask, guidedFilterAlpha(flat, mask, RADIUS, EPS), W, H, BAND);
    const y = 20;
    expect(alpha[y * W + 40 - BAND - 2]).toBe(1);
    expect(alpha[y * W + 40 + BAND + 1]).toBe(0);
    // And the 50% crossing stays put at the original boundary (±2px).
    expect(Math.abs(crossing(alpha, W, y) - 40)).toBeLessThanOrEqual(2);
  });

  it("a constant fully-covered mask stays fully covered", () => {
    const mask = makeMask(W, H, () => true);
    const q = guidedFilterAlpha(wallSky, mask, RADIUS, EPS);
    const alpha = snapAlpha(mask, q, W, H, BAND);
    for (let i = 0; i < alpha.length; i += 97) expect(alpha[i]).toBe(1);
  });

  it("guided alpha stays within [0, 1]", () => {
    const mask = makeMask(W, H, (x) => x < 43);
    const q = guidedFilterAlpha(wallSky, mask, RADIUS, EPS);
    for (let i = 0; i < q.length; i++) {
      expect(q[i]!).toBeGreaterThanOrEqual(0);
      expect(q[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("the fast (subsampled) filter matches the exact filter", () => {
    // Bigger field so the subsampled path engages; same wall/sky edge.
    const bw = 160;
    const bh = 120;
    const big = makeGuide(bw, bh, (x) => (x < 80 ? [0.85, 0.8, 0.7] : [0.55, 0.65, 0.9]));
    const mask = makeMask(bw, bh, (x) => x < 83);
    const exact = guidedFilterAlpha(big, mask, RADIUS, EPS);
    const fast = guidedFilterAlpha(big, mask, RADIUS, EPS, 2);
    // Point-wise the two stay close…
    let maxDiff = 0;
    for (let i = 0; i < exact.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(exact[i]! - fast[i]!));
    }
    expect(maxDiff).toBeLessThan(0.15);
    // …and after the snap both put the edge in the same place.
    const exactSnap = snapAlpha(mask, exact, bw, bh, BAND);
    const fastSnap = snapAlpha(mask, fast, bw, bh, BAND);
    for (let y = 20; y < bh - 20; y += 10) {
      expect(Math.abs(crossing(exactSnap, bw, y) - crossing(fastSnap, bw, y))).toBeLessThanOrEqual(1);
    }
  });
});
