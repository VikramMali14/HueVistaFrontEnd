import { describe, it, expect } from "vitest";
import {
  anchorDivisor, buildReliefMap, encodeRelief, REF_WHITE, regionLightFrom, reliefFor, SceneLight,
} from "../canvas-light";

/**
 * These decide how bright every colour in the studio renders, so each one is checked
 * against a surface whose answer is known by construction. The property that matters
 * most is the first: a canvas the clean-up got right has to render EXACTLY as it did
 * before any of this existed, or the fix for a broken canvas is a regression on every
 * good one.
 *
 * ImageData is built as a plain object rather than through a canvas — jsdom has no 2D
 * context, and nothing below reads anything but data/width/height.
 */
function img(w: number, h: number, fill: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = fill(x, y);
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h } as ImageData;
}

const allOn = (n: number) => { const b = new Uint8Array(n); b.fill(1); return b; };

describe("anchorDivisor — the albedo anchored shading divides by", () => {
  it("leaves a correctly cleaned canvas rendering exactly as it did before", () => {
    // The one property the whole change rests on. anchored form is blur/divisor, so a
    // divisor of anything but REF_WHITE here would shift every render that was fine.
    expect(anchorDivisor(REF_WHITE)).toBe(REF_WHITE);
  });

  it("recovers most of the brightness a grey clean-up costs, without all of it", () => {
    // The measured case: a wall delivered at 182/255 where fresh white was asked for.
    const delivered = 182 / 255;
    const div = anchorDivisor(delivered);
    // Assuming white cost the surface this much of its brightness...
    const lostAssumingWhite = 1 - delivered / REF_WHITE;
    // ...and dividing by the smaller number hands most of it back.
    const stillLost = 1 - delivered / div;
    expect(lostAssumingWhite).toBeGreaterThan(0.23);
    expect(stillLost).toBeLessThan(0.1);
    // But not ALL of it: a dim scene is indistinguishable from a grey clean-up in one
    // image, so some of the shortfall is deliberately still believed to be dim light.
    expect(stillLost).toBeGreaterThan(0);
    expect(div).toBeGreaterThan(delivered);
    expect(div).toBeLessThan(REF_WHITE);
  });

  it("is monotonic, so a darker canvas never renders brighter than a lighter one", () => {
    let prev = 0;
    for (let w = 0.5; w <= 1; w += 0.05) {
      const div = anchorDivisor(w);
      expect(div).toBeGreaterThan(prev);
      prev = div;
    }
  });

  it("refuses to hand a 4x gain to a mask that slipped onto something dark", () => {
    // A "white" measured at 0.15 is a broken mask, not a dim wall. Clamped, so the
    // blow-up never reaches the render at all.
    expect(anchorDivisor(0.15)).toBe(anchorDivisor(0.5));
  });
});

describe("reliefFor — how much shading to borrow from the photograph", () => {
  it("borrows everything for the flat canvas that prompted this", () => {
    // The measured defect: 172 → 191 down a whole two-storey wall face.
    expect(reliefFor(1.1)).toBe(1);
  });

  it("borrows nothing from a canvas that kept its own light", () => {
    // An untouched facade measured 3.1x across one plane.
    expect(reliefFor(3.1)).toBe(0);
    expect(reliefFor(1.8)).toBe(0);
  });

  it("ramps rather than switching, so a merely dull wall is not fully synthesised", () => {
    const mid = reliefFor(1.45);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(reliefFor(1.3)).toBeGreaterThan(mid);
  });
});

describe("regionLightFrom — reading one surface off the canvas", () => {
  it("calibrates to the lit face, not the average, so a recess cannot dim the wall", () => {
    // Three quarters of this wall is lit at 200; the last quarter is a balcony recess
    // at 60. The mean is ~165 and would brighten the whole surface to compensate.
    const px = img(100, 4, (x) => (x < 75 ? 200 : 60));
    const light = regionLightFrom(px, allOn(400))!;
    expect(light.whitePoint * 255).toBeGreaterThan(190);
  });

  it("asks for the photograph's shading only when the canvas has none of its own", () => {
    const flat = regionLightFrom(img(100, 4, (x) => 172 + Math.round((x / 99) * 19)), allOn(400))!;
    expect(flat.relief).toBe(1);

    const lit = regionLightFrom(img(100, 4, (x) => 50 + x), allOn(400))!;
    expect(lit.relief).toBe(0);
  });

  it("counts only what the mask covers, so a bright window cannot set the white", () => {
    const px = img(10, 10, (x) => (x < 5 ? 160 : 255));
    const bits = new Uint8Array(100);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) bits[y * 10 + x] = 1;
    expect(regionLightFrom(px, bits)!.whitePoint * 255).toBeCloseTo(160, 0);
  });

  it("will not read a very dark surface as a white worth a huge gain", () => {
    // A wall this dark is a mask on the wrong plane far more often than it is a wall,
    // so the measured white is floored rather than believed.
    const px = img(10, 10, () => 60);
    expect(regionLightFrom(px, allOn(100))!.whitePoint).toBe(0.5);
  });

  it("answers nothing rather than something wrong for a mask that covers nothing", () => {
    expect(regionLightFrom(img(10, 10, () => 200), new Uint8Array(100))).toBeNull();
    expect(regionLightFrom(img(10, 10, () => 0), allOn(100))).toBeNull();
  });
});

describe("encodeRelief — the map the shader decodes with one add", () => {
  const decode = (v: number) => 0.5 + v / 255;

  it("encodes an unshaded surface as a multiply by 1", () => {
    // Identical layers: no shading in this band, so the shader must not change the
    // pixel. Anything else here tints every flat wall the map is applied to.
    const flat = img(8, 8, () => 150);
    const out = encodeRelief(flat, flat);
    expect(decode(out[0]!)).toBeCloseTo(1, 2);
  });

  it("darkens where the surface sits below its surroundings, and lifts where above", () => {
    const broad = img(8, 8, () => 150);
    const shadow = encodeRelief(img(8, 8, () => 90), broad);
    const highlight = encodeRelief(img(8, 8, () => 210), broad);
    expect(decode(shadow[0]!)).toBeLessThan(0.75);
    expect(decode(highlight[0]!)).toBeGreaterThan(1.2);
  });

  it("bounds what a single dark corner may do to the paint", () => {
    // Near-black over bright: an unbounded ratio would drive the paint to zero.
    const out = encodeRelief(img(4, 4, () => 0), img(4, 4, () => 255));
    expect(decode(out[0]!)).toBeGreaterThanOrEqual(0.5);
    const inverse = encodeRelief(img(4, 4, () => 255), img(4, 4, () => 0));
    expect(decode(inverse[0]!)).toBeLessThanOrEqual(1.5);
  });

  it("keeps the alpha opaque so the map uploads as a texture, not a hole", () => {
    const out = encodeRelief(img(4, 4, () => 100), img(4, 4, () => 100));
    expect(out[3]).toBe(255);
  });
});

describe("degrading where the pixels cannot be read", () => {
  it("measures nothing rather than guessing when there is no 2D context", () => {
    // jsdom has no canvas backend, which is exactly the shape of a tainted or
    // unavailable source in the browser: the callers must get null and paint the way
    // they did before any of this existed.
    const fake = { width: 100, height: 100 } as unknown as CanvasImageSource;
    expect(SceneLight.from(fake)).toBeNull();
    expect(buildReliefMap(fake)).toBeNull();
  });

  it("declines a source with no dimensions at all", () => {
    const sizeless = { width: 0, height: 0 } as unknown as CanvasImageSource;
    expect(SceneLight.from(sizeless)).toBeNull();
    expect(buildReliefMap(sizeless)).toBeNull();
  });
});
