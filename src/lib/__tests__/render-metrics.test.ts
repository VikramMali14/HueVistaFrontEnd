import { describe, it, expect } from "vitest";
import {
  blendFit, edgeStats, lumaStats, maskBits, textureStats,
} from "../render-metrics";

/**
 * These functions produce the numbers an engineer will change a shader on. They are
 * tested against surfaces whose answer is known by construction — a flat wall, a pure
 * multiply, texture carried through vs. texture invented — because a metric that is
 * quietly wrong is worse than no metric: it sends someone to rewrite the wrong stage.
 *
 * ImageData is built as a plain object rather than through a canvas: jsdom has no 2D
 * context, and everything below reads only data/width/height anyway.
 */
function img(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const [r, g, b] = fill(x, y);
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as ImageData;
}

const grey = (v: number) => [v, v, v] as [number, number, number];
const allOn = (n: number) => { const b = new Uint8Array(n); b.fill(1); return b; };

describe("lumaStats — the spread that decides whether a wall reads as painted", () => {
  it("reports a wide spread for a plane that actually has light on it", () => {
    // A left-to-right ramp from 50 to 150 — a lit wall falling into shadow.
    const px = img(100, 10, (x) => grey(50 + x));
    const s = lumaStats(px, allOn(1000));
    expect(s.p5).toBeCloseTo(55, 0);
    expect(s.p95).toBeCloseTo(144, 0);
    expect(s.spread).toBeGreaterThan(2.5);
  });

  it("reports a spread of ~1 for a plane whose light has been flattened out", () => {
    // The defect this whole module exists to name: 172→191 across a whole wall.
    const px = img(100, 10, (x) => grey(172 + Math.round((x / 99) * 19)));
    const s = lumaStats(px, allOn(1000));
    expect(s.spread).toBeGreaterThan(1.0);
    expect(s.spread).toBeLessThan(1.2);
  });

  it("counts only what the mask covers, so a window in frame cannot skew the wall", () => {
    const px = img(10, 10, (x) => grey(x < 5 ? 100 : 255));
    const bits = new Uint8Array(100);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) bits[y * 10 + x] = 1;
    expect(lumaStats(px, bits).mean).toBeCloseTo(100, 0);
  });

  it("does not divide by a black pixel and call it infinite contrast", () => {
    const px = img(10, 10, () => grey(0));
    expect(lumaStats(px, allOn(100)).spread).toBeLessThan(2);
  });
});

describe("blendFit — telling a multiply apart from something with light in it", () => {
  it("recovers a pure multiply exactly: slope = the ratio, intercept 0, R² 1", () => {
    const base = img(60, 10, (x) => grey(60 + x * 2));
    const painted = img(60, 10, (x) => grey(Math.round((60 + x * 2) * 0.5)));
    const fit = blendFit(base, painted, allOn(600));
    expect(fit.r.slope).toBeCloseTo(0.5, 2);
    expect(Math.abs(fit.r.intercept)).toBeLessThan(1);
    expect(fit.meanR2).toBeGreaterThan(0.99);
  });

  it("refuses to fit a line through a base with no variance, rather than claiming a perfect one", () => {
    // A flat base fits ANY output perfectly in the degenerate sense. Reporting R² 1
    // there would read as "clean multiply" when the truth is "nothing to multiply".
    const base = img(20, 10, () => grey(180));
    const painted = img(20, 10, (x) => grey(70 + x));
    const fit = blendFit(base, painted, allOn(200));
    expect(fit.meanR2).toBe(0);
  });

  it("keeps the channels apart, since a colour cast lives in their difference", () => {
    const base = img(40, 10, (x) => [60 + x, 60 + x, 60 + x]);
    const painted = img(40, 10, (x) => [
      Math.round((60 + x) * 0.8), Math.round((60 + x) * 0.5), Math.round((60 + x) * 0.2),
    ]);
    const fit = blendFit(base, painted, allOn(400));
    expect(fit.r.slope).toBeCloseTo(0.8, 1);
    expect(fit.g.slope).toBeCloseTo(0.5, 1);
    expect(fit.b.slope).toBeCloseTo(0.2, 1);
  });
});

describe("textureStats — whose grain is on the wall", () => {
  it("scores a perfect correlation when the photo's own texture is carried through", () => {
    const tex = (x: number, y: number) => 120 + ((x * 7 + y * 13) % 11);
    const base = img(40, 40, (x, y) => grey(tex(x, y)));
    // Same texture, new colour: every high-frequency wiggle survives the recolour.
    const painted = img(40, 40, (x, y) => grey(Math.round(tex(x, y) * 0.6)));
    const t = textureStats(base, painted, allOn(1600), 40, 40);
    expect(t.correlation).toBeGreaterThan(0.99);
    expect(t.ratio).toBeCloseTo(0.6, 1);
  });

  it("scores near zero when the real grain was dropped and synthetic noise sprayed on", () => {
    let seed = 1;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const base = img(40, 40, (x, y) => grey(120 + ((x * 7 + y * 13) % 11)));
    const painted = img(40, 40, () => grey(Math.round(80 + rnd() * 40)));
    const t = textureStats(base, painted, allOn(1600), 40, 40);
    expect(Math.abs(t.correlation)).toBeLessThan(0.3);
  });

  it("flags texture ADDED on top: more high-frequency energy out than went in", () => {
    const base = img(40, 40, () => grey(180));
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const painted = img(40, 40, () => grey(Math.round(100 + rnd() * 30)));
    const t = textureStats(base, painted, allOn(1600), 40, 40);
    expect(t.paintedEnergy).toBeGreaterThan(t.baseEnergy);
    expect(t.ratio).toBeGreaterThan(2);
  });

  it("ignores the mask's own boundary, which is a step and not plaster", () => {
    // Half masked, and the two halves differ hugely. If the boundary were counted the
    // energy would be dominated by that one step.
    const base = img(40, 40, (x) => grey(x < 20 ? 30 : 220));
    const bits = new Uint8Array(1600);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 20; x++) bits[y * 40 + x] = 1;
    const t = textureStats(base, base, bits, 40, 40);
    expect(t.baseEnergy).toBeLessThan(1);
  });
});

describe("edgeStats — how pasted-on the boundary reads", () => {
  it("calls a hard mask edge zero pixels wide", () => {
    const mask = img(40, 8, (x) => grey(x < 20 ? 0 : 255));
    const e = edgeStats(mask, 40)!;
    expect(e.medianMaskPx).toBe(0);
    expect(e.transitions).toBeGreaterThan(0);
  });

  it("measures the width of a feathered edge", () => {
    // A 6px ramp from black to white, centred at x=20.
    const mask = img(40, 8, (x) => {
      if (x < 17) return grey(0);
      if (x > 23) return grey(255);
      return grey(Math.round(((x - 17) / 6) * 255));
    });
    const e = edgeStats(mask, 40)!;
    expect(e.medianMaskPx).toBeGreaterThanOrEqual(4);
    expect(e.medianMaskPx).toBeLessThanOrEqual(7);
  });

  it("scales a low-res mask's edge onto the canvas it is stretched over", () => {
    const mask = img(40, 8, (x) => grey(x < 20 ? 0 : 255));
    // Same mask, four times the canvas: a 1px mask edge is 4px of wall.
    expect(edgeStats(mask, 160)!.medianCanvasPx).toBe(0);
    const soft = img(40, 8, (x) => (x < 19 ? grey(0) : x > 21 ? grey(255) : grey(128)));
    expect(edgeStats(soft, 160)!.medianCanvasPx).toBeGreaterThan(3);
  });

  it("says nothing rather than something when the mask has no boundary in frame", () => {
    expect(edgeStats(img(20, 8, () => grey(255)), 20)).toBeNull();
  });
});

describe("maskBits", () => {
  it("takes bright opaque pixels as the surface and leaves the rest out", () => {
    const mask = img(4, 1, (x) => grey(x < 2 ? 0 : 255));
    expect(Array.from(maskBits(mask))).toEqual([0, 0, 1, 1]);
  });

  it("treats a transparent pixel as outside, however bright it is", () => {
    const data = new Uint8ClampedArray(8);
    data[0] = 255; data[1] = 255; data[2] = 255; data[3] = 0;
    data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 255;
    expect(Array.from(maskBits({ data, width: 2, height: 1 } as ImageData))).toEqual([0, 1]);
  });
});
