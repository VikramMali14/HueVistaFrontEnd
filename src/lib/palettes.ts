/**
 * Room-palette suggestions for the studio's AI Suggest tab. Each palette is a
 * main / accent / trim trio built from a colour scheme (tonal, analogous,
 * complementary, deep) around a seed hue — the colour already applied to the
 * active wall when there is one, otherwise a rotating set of designer seeds.
 * Every target is snapped to the nearest REAL catalogue shade (ΔE76), so a
 * palette is always three orderable colours, never a made-up hex.
 */

import { hexToHsv, hsvToHex, nearestShades } from "./color";
import { isWhiteShade } from "./color-science";
import type { PaintShade } from "./types";

export interface Palette {
  name: string;
  rationale: string;
  main: PaintShade;
  accent: PaintShade;
  trim: PaintShade;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function mk(h: number, s: number, v: number): string {
  return hsvToHex({ h: ((h % 360) + 360) % 360, s: clamp(s), v: clamp(v) });
}

/** Seed hues rotated through when no wall colour anchors the palettes. */
const SEED_HUES: ReadonlyArray<number> = [26, 210, 130, 350, 46, 270];

interface Scheme {
  name: string;
  rationale: string;
  targets: (h: number, s: number) => { main: string; accent: string; trim: string };
}

const SCHEMES: ReadonlyArray<Scheme> = [
  {
    name: "Tonal calm",
    rationale: "One hue at three depths — restful, and hard to get wrong.",
    targets: (h, s) => ({
      main: mk(h, Math.max(0.18, s * 0.55), 0.78),
      accent: mk(h, clamp(Math.max(s, 0.3) * 1.15, 0.25, 0.8), 0.42),
      trim: mk(h, 0.07, 0.95),
    }),
  },
  {
    name: "Soft contrast",
    rationale: "Neighbouring hues keep the room lively but easy to live with.",
    targets: (h, s) => ({
      main: mk(h, Math.max(0.15, s * 0.45), 0.85),
      accent: mk(h + 32, clamp(Math.max(s, 0.35), 0.3, 0.7), 0.5),
      trim: mk(h + 16, 0.06, 0.94),
    }),
  },
  {
    name: "Bold accent",
    rationale: "Quiet walls with one wall that does the talking.",
    targets: (h, s) => ({
      main: mk(h, 0.1, 0.92),
      accent: mk(h + 180, clamp(Math.max(s, 0.45), 0.35, 0.8), 0.4),
      trim: mk(h, 0.05, 0.96),
    }),
  },
  {
    name: "Heritage depth",
    rationale: "Deep, muted walls with a soft light trim — evening rooms love it.",
    targets: (h, s) => ({
      main: mk(h, clamp(Math.max(s, 0.3) * 0.85, 0.2, 0.7), 0.5),
      accent: mk(h - 24, clamp(Math.max(s, 0.35), 0.3, 0.75), 0.32),
      trim: mk(h, 0.08, 0.93),
    }),
  },
];

/** Nearest unused catalogue shade to a target hex; undefined if the pool is spent. */
function snap(
  target: string,
  pool: ReadonlyArray<PaintShade>,
  used: Set<string>,
): PaintShade | undefined {
  for (const { shade } of nearestShades(target, pool, 5)) {
    if (used.has(shade.code)) continue;
    used.add(shade.code);
    return shade;
  }
  return undefined;
}

/**
 * One palette per scheme. `seedHex` anchors every scheme to the wall's colour;
 * without it the schemes build around a rotating designer seed. `variant`
 * (the Shuffle counter) nudges an anchored hue a little each press, and jumps
 * an unanchored seed to the next hue entirely.
 */
export function generatePalettes(
  catalogue: ReadonlyArray<PaintShade>,
  seedHex?: string,
  variant = 0,
): Palette[] {
  if (catalogue.length === 0) return [];

  const anchored = Boolean(seedHex);
  const base = seedHex ? hexToHsv(seedHex) : { h: SEED_HUES[variant % SEED_HUES.length]!, s: 0.5, v: 0.6 };
  const hue = anchored ? base.h + variant * 18 : base.h;

  // Trim wants a true white when the catalogue has one.
  const whites = catalogue.filter(isWhiteShade);
  const trimPool = whites.length > 0 ? whites : catalogue;

  const out: Palette[] = [];
  for (const scheme of SCHEMES) {
    const t = scheme.targets(hue, base.s);
    const used = new Set<string>();
    const main = snap(t.main, catalogue, used);
    const accent = snap(t.accent, catalogue, used);
    const trim = snap(t.trim, trimPool, used) ?? snap(t.trim, catalogue, used);
    if (main && accent && trim) {
      out.push({ name: scheme.name, rationale: scheme.rationale, main, accent, trim });
    }
  }
  return out;
}
