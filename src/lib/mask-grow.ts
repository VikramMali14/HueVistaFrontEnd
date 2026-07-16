/**
 * Grow an existing selection into the rest of a same-coloured object.
 *
 * The Mask Studio's wand fills a whole surface from ONE tap, but a hand-drawn
 * or wand selection often catches only part of an object — half a pillar, one
 * side of a shaded wall. "Complete" grows the CURRENT selection outward into
 * every connected pixel whose colour matches the selection, so the rest of the
 * pillar joins in one action and the growth stops at the object's real colour
 * edges (the pillar/wall line).
 *
 * Matching is SELECTION-relative, not neighbour-relative: a candidate joins
 * when its colour is within `reach` of the selection's MEAN colour, exactly
 * like the wand matches against its seed. That keeps the growth from drifting
 * across the whole room the way a neighbour-relative flood would — it can only
 * spread through pixels that look like what is already selected.
 *
 * Pure (typed arrays in, typed array out) so it is unit-testable without a
 * canvas; the studio downscales the mask to wand resolution, calls this, then
 * composites the result back over the working mask.
 */

/** Perceptually-weighted squared RGB distance, matching the wand's floodFill:
 *  green weighted most, then blue, then red; the reach→threshold scale (×9) is
 *  shared so "Reach" means the same tolerance for both tools. */
function withinReach(
  dr: number,
  dg: number,
  db: number,
  threshold: number,
): boolean {
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db <= threshold;
}

/**
 * Grow `seed` (0/255 per pixel) into connected pixels of `photo` (RGBA, w×h)
 * whose colour is within `reach` of the selection's mean colour. Returns a new
 * 0/255 mask that always CONTAINS the seed (growth only adds). An empty seed is
 * returned unchanged — there is nothing to match against.
 */
export function growSelectionToSimilar(
  photo: Uint8ClampedArray,
  w: number,
  h: number,
  seed: Uint8Array,
  reach: number,
): Uint8Array {
  const n = w * h;
  const out = seed.slice();

  // Mean colour of the current selection — the reference every candidate is
  // measured against (selection-relative, like the wand's seed colour).
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!out[i]) continue;
    const j = i * 4;
    sr += photo[j]!;
    sg += photo[j + 1]!;
    sb += photo[j + 2]!;
    count++;
  }
  if (count === 0) return out; // nothing selected — nothing to grow from
  sr /= count;
  sg /= count;
  sb /= count;

  const threshold = reach * reach * 9;
  const match = (i: number): boolean => {
    const j = i * 4;
    return withinReach(photo[j]! - sr, photo[j + 1]! - sg, photo[j + 2]! - sb, threshold);
  };

  // Flood outward from the selection's boundary. Every currently-selected pixel
  // is a potential source; a 4-connected neighbour joins when it is unselected
  // and matches the mean. Colour edges (the pillar/background line) bound the
  // spread, so no explicit distance cap is needed — the same contract as the
  // wand's floodFill.
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (out[i]) stack.push(i);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) {
      const q = p - 1;
      if (!out[q] && match(q)) {
        out[q] = 255;
        stack.push(q);
      }
    }
    if (x < w - 1) {
      const q = p + 1;
      if (!out[q] && match(q)) {
        out[q] = 255;
        stack.push(q);
      }
    }
    if (y > 0) {
      const q = p - w;
      if (!out[q] && match(q)) {
        out[q] = 255;
        stack.push(q);
      }
    }
    if (y < h - 1) {
      const q = p + w;
      if (!out[q] && match(q)) {
        out[q] = 255;
        stack.push(q);
      }
    }
  }
  return out;
}
