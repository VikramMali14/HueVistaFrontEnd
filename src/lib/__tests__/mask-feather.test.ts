import { describe, expect, it } from "vitest";
import { blurCoverage, chokeInward, featherRadiusInMaskPx, offsetCoverage } from "../mask-feather";

/** Build a w×h coverage field where `inside(x, y)` marks the masked region. */
function field(w: number, h: number, inside: (x: number, y: number) => boolean): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[y * w + x] = inside(x, y) ? 1 : 0;
  }
  return f;
}

/** The full pipeline the engines run: blur, then choke back inside the mask. */
function feather(hard: Float32Array, w: number, h: number, radius: number): Float32Array {
  return chokeInward(hard, blurCoverage(hard, w, h, radius));
}

describe("inward mask feather", () => {
  const W = 40;
  const H = 40;
  // Left half masked: a straight vertical edge at x = 20.
  const halfPlane = field(W, H, (x) => x < 20);

  it("never paints outside the hard mask (the halo regression)", () => {
    const out = feather(halfPlane, W, H, 3);
    for (let y = 0; y < H; y++) {
      for (let x = 20; x < W; x++) {
        expect(out[y * W + x]).toBe(0);
      }
    }
  });

  it("keeps the region interior at full coverage", () => {
    const out = feather(halfPlane, W, H, 3);
    // Deep inside the region the blur reads solid 1 and the choke keeps it.
    expect(out[20 * W + 5]).toBeCloseTo(1, 5);
  });

  it("ramps coverage up monotonically moving inward from the boundary", () => {
    const out = feather(halfPlane, W, H, 3);
    const row = 20 * W;
    for (let x = 19; x > 0; x--) {
      expect(out[row + x - 1]!).toBeGreaterThanOrEqual(out[row + x]!);
    }
    // The edge is genuinely soft: the boundary pixel sits below full paint.
    expect(out[row + 19]!).toBeLessThan(0.9);
    expect(out[row + 19]!).toBeGreaterThan(0);
  });

  it("leaves thin unmasked gaps (railing bars) completely unpainted", () => {
    // A solid region with a 2px vertical gap — like the sky between railing
    // bars. A plain Gaussian feather floods such gaps with half-strength paint.
    const gap = field(W, H, (x) => x !== 18 && x !== 19);
    const out = feather(gap, W, H, 3);
    for (let y = 0; y < H; y++) {
      expect(out[y * W + 18]).toBe(0);
      expect(out[y * W + 19]).toBe(0);
    }
  });

  it("does not erode a region that touches the image border", () => {
    // Mask covers everything: the clamped blur must read solid coverage even
    // at the canvas edges, so photo-border pixels keep full paint.
    const solid = field(W, H, () => true);
    const out = feather(solid, W, H, 3);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[W - 1]!).toBeCloseTo(1, 5);
    expect(out[(H - 1) * W]!).toBeCloseTo(1, 5);
    expect(out[H * W - 1]!).toBeCloseTo(1, 5);
  });

  it("blurCoverage spreads a hard edge into a soft ramp on both sides", () => {
    const soft = blurCoverage(halfPlane, W, H, 3);
    const row = 20 * W;
    // ON the straight boundary the blur reads ~0.5 — the choke's remap starts
    // below that so the fade anchors at the boundary itself.
    expect(soft[row + 19]!).toBeGreaterThan(0.3);
    expect(soft[row + 20]!).toBeLessThan(0.7);
    expect(soft[row + 24]!).toBeGreaterThan(0); // spread past the edge…
    expect(feather(halfPlane, W, H, 3)[row + 24]).toBe(0); // …but choked to 0
  });

  it("offsetCoverage grows and shrinks the boundary by the requested pixels", () => {
    // Edge at x = 20 (first uncovered pixel). The 0.5 crossing must move by
    // the offset, ±1px of anti-aliasing tolerance.
    const crossing = (out: Float32Array) => {
      const row = 20 * W;
      for (let x = 0; x < W; x++) {
        if (out[row + x]! < 0.5) return x;
      }
      return W;
    };
    expect(crossing(offsetCoverage(halfPlane, W, H, 2))).toBeGreaterThanOrEqual(21);
    expect(crossing(offsetCoverage(halfPlane, W, H, 2))).toBeLessThanOrEqual(23);
    expect(crossing(offsetCoverage(halfPlane, W, H, -2))).toBeGreaterThanOrEqual(17);
    expect(crossing(offsetCoverage(halfPlane, W, H, -2))).toBeLessThanOrEqual(19);
    expect(offsetCoverage(halfPlane, W, H, 0)).toBe(halfPlane); // 0 = untouched
  });

  it("offsetCoverage keeps far interior and exterior binary", () => {
    const out = offsetCoverage(halfPlane, W, H, 2);
    expect(out[20 * W + 5]).toBeCloseTo(1, 5);
    expect(out[20 * W + 35]).toBeCloseTo(0, 5);
  });

  it("rescales the feather radius from photo pixels to mask pixels", () => {
    // Half-resolution mask: 3 photo px of softness = 1.5 mask px of blur.
    expect(featherRadiusInMaskPx(3, 600, 1200)).toBeCloseTo(1.5);
    // Same-resolution mask passes through unchanged.
    expect(featherRadiusInMaskPx(3, 1200, 1200)).toBe(3);
    // Unknown photo size — use the radius as-is rather than guessing.
    expect(featherRadiusInMaskPx(3, 600, 0)).toBe(3);
  });
});
