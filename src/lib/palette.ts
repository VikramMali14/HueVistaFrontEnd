/**
 * Dominant-colour palette extraction from image pixel data — shared by the
 * colour finder (room photos) and the fabric-palette tool (sarees, sofas,
 * curtains). Pure: takes pixels, returns hexes.
 */

import { deltaE, rgbToHex, rgbToLab, type RGB } from "./color";

/**
 * Quantize pixels into coarse RGB buckets, rank by frequency, then greedily
 * keep the most frequent colours that are still perceptually distinct (ΔE)
 * from the ones already chosen.
 */
export function extractPalette(data: Uint8ClampedArray, maxColors: number): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const STEP = 24;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue; // skip near-transparent
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = Math.round(r / STEP) * 10000 + Math.round(g / STEP) * 100 + Math.round(b / STEP);
    const cur = buckets.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.n++; }
    else buckets.set(key, { r, g, b, n: 1 });
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((c) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }));
  const picked: RGB[] = [];
  for (const c of ranked) {
    if (picked.length >= maxColors) break;
    const lab = rgbToLab(c);
    if (picked.every((p) => deltaE(lab, rgbToLab(p)) > 12)) picked.push(c);
  }
  return picked.map(rgbToHex);
}
