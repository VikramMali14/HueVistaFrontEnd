import { describe, it, expect } from "vitest";
import { growSelectionToSimilar } from "../mask-grow";

const W = 40;
const H = 20;

/** Build an RGBA photo from a per-pixel colour function. */
function makePhoto(at: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = at(x, y);
      const j = (y * W + x) * 4;
      px[j] = r;
      px[j + 1] = g;
      px[j + 2] = b;
      px[j + 3] = 255;
    }
  }
  return px;
}

function makeSeed(inside: (x: number, y: number) => boolean): Uint8Array {
  const s = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) s[y * W + x] = inside(x, y) ? 255 : 0;
  }
  return s;
}

const countOn = (m: Uint8Array): number => m.reduce((a, v) => a + (v ? 1 : 0), 0);

// A pillar: a beige vertical band at x ∈ [10, 20) on a darker grey wall.
const PILLAR: [number, number, number] = [210, 195, 165];
const WALL: [number, number, number] = [90, 92, 96];
const inPillar = (x: number) => x >= 10 && x < 20;
const pillarPhoto = makePhoto((x) => (inPillar(x) ? PILLAR : WALL));

describe("growSelectionToSimilar", () => {
  it("completes a half-covered pillar to the whole pillar", () => {
    // The selection caught only the left half of the pillar (x ∈ [10, 15)).
    const seed = makeSeed((x) => x >= 10 && x < 15);
    const grown = growSelectionToSimilar(pillarPhoto, W, H, seed, 28);
    // Every pillar pixel is now selected…
    for (let y = 0; y < H; y++) {
      for (let x = 10; x < 20; x++) expect(grown[y * W + x]).toBe(255);
    }
    // …and nothing on the wall was touched.
    for (let y = 0; y < H; y++) {
      expect(grown[y * W + 5]).toBe(0);
      expect(grown[y * W + 30]).toBe(0);
    }
  });

  it("never removes any originally-selected pixel", () => {
    const seed = makeSeed((x) => x >= 10 && x < 15);
    const grown = growSelectionToSimilar(pillarPhoto, W, H, seed, 28);
    for (let i = 0; i < seed.length; i++) {
      if (seed[i]) expect(grown[i]).toBe(255);
    }
    expect(countOn(grown)).toBeGreaterThan(countOn(seed));
  });

  it("stops at the colour edge — does not bleed into a different-coloured wall", () => {
    const seed = makeSeed((x) => x >= 10 && x < 15);
    const grown = growSelectionToSimilar(pillarPhoto, W, H, seed, 28);
    // The pillar is 10 wide × 20 tall = 200 px; growth must not exceed it.
    expect(countOn(grown)).toBe(200);
  });

  it("returns an empty selection unchanged", () => {
    const empty = new Uint8Array(W * H);
    const grown = growSelectionToSimilar(pillarPhoto, W, H, empty, 28);
    expect(countOn(grown)).toBe(0);
  });

  it("a low reach keeps the growth from crossing into a similar-but-distinct colour", () => {
    // Two adjacent bands only mildly different: with a tight reach the growth
    // stays in the seed's band instead of spilling into the neighbour.
    const A: [number, number, number] = [200, 200, 200];
    const B: [number, number, number] = [170, 170, 170];
    const photo = makePhoto((x) => (x < 20 ? A : B));
    const seed = makeSeed((x) => x >= 2 && x < 8);
    const tight = growSelectionToSimilar(photo, W, H, seed, 8);
    for (let y = 0; y < H; y++) expect(tight[y * W + 25]).toBe(0); // never reached band B
  });
});
