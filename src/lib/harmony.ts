/**
 * Coordinate-shade suggestions. Given the colour the user just picked for the
 * active wall, surface catalogue shades that *go with it* for each wall role:
 *   - MAIN_WALL : tonal neighbours of the pick (shades they may also like)
 *   - OTHER_WALL: companions that sit with the main wall rather than answer it
 *   - TRIM      : light, soft coordinating trims
 *   - ACCENT_WALL: richer complementary / analogous accents
 * Every generated target is snapped to the nearest REAL catalogue shade (ΔE76),
 * so suggestions are always orderable, in-stock colours — never a made-up hex.
 */

import type { PaintShade, RegionKind } from "./types";
import { hexToHsv, hsvToHex, nearestShades } from "./color";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** Candidate target colours for a role, derived from the picked base colour. */
function genTargets(baseHex: string, role: RegionKind): string[] {
  const b = hexToHsv(baseHex);
  const mk = (h: number, s: number, v: number) =>
    hsvToHex({ h: ((h % 360) + 360) % 360, s: clamp(s), v: clamp(v) });

  if (role === "TRIM") {
    // Trim reads best soft and light — pale tints of the wall hue + warm whites.
    return [
      mk(b.h, b.s * 0.18, Math.max(0.92, b.v)),
      mk(b.h, b.s * 0.1, 0.96),
      mk(b.h, 0.06, 0.9),
      mk(b.h + 30, b.s * 0.15, 0.93),
    ];
  }
  if (role === "ACCENT_WALL") {
    // Accent walls want contrast: complementary + split-complementary, deeper.
    return [
      mk(b.h + 180, clamp(b.s * 1.1, 0.3, 0.85), clamp(b.v * 0.85, 0.25, 0.7)),
      mk(b.h + 150, clamp(b.s, 0.3, 0.82), clamp(b.v * 0.8, 0.2, 0.7)),
      mk(b.h + 210, clamp(b.s, 0.3, 0.82), clamp(b.v * 0.8, 0.2, 0.7)),
      mk(b.h + 30, clamp(b.s * 1.05, 0.3, 0.85), clamp(b.v * 0.9, 0.25, 0.78)),
    ];
  }
  if (role === "OTHER_WALL") {
    // Another wall in the same room: it has to sit WITH the main wall rather than
    // answer it, so these are companions a shade or two off — near in hue, a little
    // lighter or a little deeper. Sending these through the MAIN_WALL branch (which
    // is what happened while OTHER_WALL was flattened into ACCENT_WALL, and then
    // through the accent branch) offered a second feature wall for every ordinary
    // third wall in a room.
    return [
      mk(b.h, clamp(b.s * 0.75), clamp(b.v * 1.05)),
      mk(b.h, clamp(b.s * 0.9), clamp(b.v * 0.88)),
      mk(b.h + 18, clamp(b.s * 0.8), clamp(b.v * 0.98)),
      mk(b.h - 18, clamp(b.s * 0.8), clamp(b.v * 0.98)),
    ];
  }
  // MAIN_WALL / MANUAL: gentle tonal + small hue neighbours of the pick.
  return [
    mk(b.h, b.s, b.v),
    mk(b.h, clamp(b.s * 0.8), clamp(b.v * 1.08)),
    mk(b.h, clamp(b.s * 1.12), clamp(b.v * 0.9)),
    mk(b.h + 12, b.s, b.v),
    mk(b.h - 12, b.s, b.v),
  ];
}

/**
 * Up to `n` distinct catalogue shades that coordinate with `baseHex` for `role`.
 * `excludeCodes` (e.g. shades already applied elsewhere) are filtered out so the
 * groups don't repeat colours the user has already placed.
 */
export function suggestForRole(
  baseHex: string,
  role: RegionKind,
  catalogue: ReadonlyArray<PaintShade>,
  n = 4,
  excludeCodes: ReadonlyArray<string> = [],
): PaintShade[] {
  if (catalogue.length === 0) return [];
  const out: PaintShade[] = [];
  const seen = new Set<string>(excludeCodes);
  for (const target of genTargets(baseHex, role)) {
    // Take the closest catalogue shade to this target that we haven't used yet.
    for (const { shade } of nearestShades(target, catalogue, 4)) {
      if (seen.has(shade.code)) continue;
      seen.add(shade.code);
      out.push(shade);
      break;
    }
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}
