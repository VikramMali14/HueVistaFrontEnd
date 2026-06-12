/**
 * Colour-science layer on top of lib/color.ts — everything the catalogue's
 * counter tools need: undertone classification, white-tint sorting, clash
 * detection, dark-room and sun-fade heuristics, fan-deck strips, lamplight
 * shift, and ceiling/trim pairing. All pure and unit-tested.
 *
 * Conventions: Lab from lib/color.ts (D65). "Hue" below is the CIELAB hue
 * angle in degrees — atan2(b, a) — where 0° ≈ pink-red, 90° ≈ yellow,
 * 180° ≈ green, 270° ≈ blue. "Chroma" is √(a² + b²); low chroma means the
 * colour is close to grey and undertone talk stops mattering.
 */

import { deltaE, hexToLab, hexToRgb, luminance, rgbToHex, rgbToLab, type Lab } from "./color";
import type { PaintShade } from "./types";

// ── Lab geometry ───────────────────────────────────────────────────────────

export function chroma(lab: Lab): number {
  return Math.hypot(lab.a, lab.b);
}

/** CIELAB hue angle in [0, 360). Meaningless when chroma is near zero. */
export function labHue(lab: Lab): number {
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return (h + 360) % 360;
}

/** Smallest angular distance between two hues, in [0, 180]. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Approximate LRV (0–100) straight from a hex — for colours without one. */
export function lrvFromHex(hex: string): number {
  return Math.round(luminance(hexToRgb(hex)) * 100);
}

// ── Undertones ─────────────────────────────────────────────────────────────

export type Undertone =
  | "pinkish"
  | "peachy"
  | "yellowish"
  | "greenish"
  | "bluish"
  | "violet"
  | "neutral";

/** Chroma below this reads as grey — no meaningful undertone. */
const NEUTRAL_CHROMA = 4;

export function undertone(hex: string): Undertone {
  const lab = hexToLab(hex);
  if (chroma(lab) < NEUTRAL_CHROMA) return "neutral";
  // CIELAB hue anchors: red ≈ 40°, orange ≈ 59°, yellow ≈ 102°, green ≈ 136°,
  // cyan ≈ 196°, blue ≈ 306°, magenta ≈ 328° — the cool arc is wide, the warm
  // arc cramped, so these bands are NOT evenly spaced on purpose.
  const h = labHue(lab);
  if (h < 40) return "pinkish";
  if (h < 75) return "peachy";
  if (h < 115) return "yellowish";
  if (h < 175) return "greenish";
  if (h < 312) return "bluish";
  if (h < 345) return "violet";
  return "pinkish";
}

export type Temperature = "warm" | "cool" | "neutral";

const WARM_TONES: ReadonlyArray<Undertone> = ["pinkish", "peachy", "yellowish"];

export function temperature(hex: string): Temperature {
  const tone = undertone(hex);
  if (tone === "neutral") return "neutral";
  return WARM_TONES.includes(tone) ? "warm" : "cool";
}

export interface ClashVerdict {
  clash: boolean;
  /** Plain-words reason, ready to show to a customer. */
  reason?: string;
}

/**
 * Do two shades "fight"? Two cases worth warning about:
 *  - a clearly warm colour next to a clearly cool one (both saturated enough
 *    that the difference shows on a wall);
 *  - two near-whites whose hidden tints pull different ways (the classic
 *    "my ceiling white looks dirty next to the wall white" complaint).
 * Anything involving a true neutral never clashes.
 */
export function undertoneClash(hexA: string, hexB: string): ClashVerdict {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  const cA = chroma(labA);
  const cB = chroma(labB);

  // Whites: small tints, but side by side they show.
  if (labA.L >= 85 && labB.L >= 85) {
    const tintA = whiteTint(hexA);
    const tintB = whiteTint(hexB);
    if (tintA !== "neutral" && tintB !== "neutral" && tintA !== tintB) {
      return { clash: true, reason: `one white leans ${tintA}, the other ${tintB} — side by side they fight` };
    }
    return { clash: false };
  }

  if (cA < 8 || cB < 8) return { clash: false };
  const tA = temperature(hexA);
  const tB = temperature(hexB);
  if (tA !== "neutral" && tB !== "neutral" && tA !== tB) {
    return {
      clash: true,
      reason: `${undertone(hexA)} (${tA}) against ${undertone(hexB)} (${tB}) can look odd in the same room`,
    };
  }
  return { clash: false };
}

// ── Whites ─────────────────────────────────────────────────────────────────

export type WhiteTint = "warm" | "pinkish" | "greenish" | "cool" | "neutral";

/** Display order for the whites finder — warm side first. */
export const WHITE_TINTS: ReadonlyArray<WhiteTint> = ["warm", "pinkish", "neutral", "greenish", "cool"];

export function isWhiteShade(s: PaintShade): boolean {
  if (s.family === "Whites") return true;
  const lab = hexToLab(s.hex);
  return s.lrv >= 72 && chroma(lab) < 10;
}

/** The hidden tint of a near-white. Thresholds are deliberately small. */
export function whiteTint(hex: string): WhiteTint {
  const lab = hexToLab(hex);
  if (lab.b >= 5) return "warm"; // yellow-leaning
  if (lab.a >= 3) return "pinkish";
  if (lab.a <= -3) return "greenish";
  if (lab.b <= -2) return "cool"; // blue-leaning
  return "neutral";
}

// ── Dark-room and lighter-step helpers ─────────────────────────────────────

/** Below this LRV a whole room starts to feel dark without strong lighting. */
export const DARK_ROOM_LRV = 25;

/**
 * Up to `n` catalogue shades that read as "the same colour, one or two steps
 * lighter": meaningfully higher LRV, similar hue, broadly similar chroma.
 * Sorted lightest-step-first (closest LRV above the seed first).
 */
export function lighterSteps(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  n = 2,
): PaintShade[] {
  const seed = hexToLab(shade.hex);
  const seedHue = labHue(seed);
  const seedChroma = chroma(seed);
  const pick = (maxHueDist: number, chromaSlack: number) =>
    catalogue
      .filter((c) => {
        if (c.code === shade.code || c.lrv < shade.lrv + 8) return false;
        const lab = hexToLab(c.hex);
        // Both near-grey → hue is meaningless, treat as same family.
        const hueOk =
          seedChroma < NEUTRAL_CHROMA || chroma(lab) < NEUTRAL_CHROMA
            ? Math.abs(chroma(lab) - seedChroma) <= chromaSlack
            : hueDistance(labHue(lab), seedHue) <= maxHueDist;
        return hueOk && Math.abs(chroma(lab) - seedChroma) <= chromaSlack;
      })
      .sort((a, b) => a.lrv - b.lrv);
  let out = pick(35, 25);
  if (out.length === 0) out = pick(60, 45); // relax before giving up
  return out.slice(0, n);
}

// ── Fan deck ───────────────────────────────────────────────────────────────

/**
 * The lighter-to-darker strip a paper shade card would show for this shade's
 * family: catalogue neighbours in hue (or fellow neutrals), sorted lightest
 * first, windowed to `max` entries around the seed. The seed is always in it.
 */
export function fanDeck(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  max = 9,
): PaintShade[] {
  const seed = hexToLab(shade.hex);
  const seedHue = labHue(seed);
  const seedNeutral = chroma(seed) < NEUTRAL_CHROMA;
  const family = catalogue.filter((c) => {
    if (c.code === shade.code) return true;
    const lab = hexToLab(c.hex);
    const neutral = chroma(lab) < NEUTRAL_CHROMA;
    if (seedNeutral || neutral) return seedNeutral === neutral || c.family === shade.family;
    return hueDistance(labHue(lab), seedHue) <= 28 || c.family === shade.family;
  });
  const sorted = [...family].sort((a, b) => b.lrv - a.lrv);
  const i = sorted.findIndex((s) => s.code === shade.code);
  if (sorted.length <= max) return sorted;
  // Window centred on the seed, clamped to the ends of the strip.
  let start = Math.max(0, i - Math.floor(max / 2));
  start = Math.min(start, sorted.length - max);
  return sorted.slice(start, start + max);
}

/** The next strip entry one step lighter (-1) or darker (+1), if any. */
export function stepInFanDeck(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  direction: -1 | 1,
): PaintShade | undefined {
  // Use a generous strip so stepping never dead-ends because of windowing.
  const strip = fanDeck(shade, catalogue, 999);
  const i = strip.findIndex((s) => s.code === shade.code);
  if (i < 0) return undefined;
  return strip[i + direction];
}

// ── Lamplight shift ("changes under light") ────────────────────────────────

export interface LightShift {
  /** How much MORE this colour moves under a warm lamp than a grey would. */
  score: number;
  /** Approximate appearance under a warm household lamp, for a mini preview. */
  warmHex: string;
}

/** Shades scoring at or above this get the "changes under light" badge. */
export const LIGHT_SHIFT_BADGE = 6;

/**
 * Approximate how a colour moves between daylight and a warm bulb. We scale
 * the linear channels toward incandescent, then measure the CHROMATIC
 * displacement relative to how a neutral grey of the same lightness moves —
 * greys shift too, but eyes adapt to that; what surprises people is a shade
 * shifting differently from the room around it.
 */
export function lightShift(hex: string): LightShift {
  const warm = (h: string) => {
    const { r, g, b } = hexToRgb(h);
    return { r: Math.min(255, r * 1.08), g: g * 0.99, b: b * 0.78 };
  };
  const lab = hexToLab(hex);
  const shifted = rgbToLab(warm(hex));
  // A grey with roughly the same lightness, pushed through the same lamp.
  const greyLevel = Math.round((hexToRgb(hex).r + hexToRgb(hex).g + hexToRgb(hex).b) / 3);
  const greyHex = rgbToHex({ r: greyLevel, g: greyLevel, b: greyLevel });
  const grey = hexToLab(greyHex);
  const greyShifted = rgbToLab(warm(greyHex));
  const da = shifted.a - lab.a - (greyShifted.a - grey.a);
  const db = shifted.b - lab.b - (greyShifted.b - grey.b);
  return {
    score: Math.hypot(da, db),
    warmHex: rgbToHex(warm(hex)),
  };
}

// ── Sun fade (exterior) ────────────────────────────────────────────────────

/**
 * Deep, saturated reds, violets and blues are the classic fast-faders on
 * sun-facing exterior walls (organic red/violet pigments break down first).
 */
export function sunFadeRisk(shade: PaintShade): boolean {
  const lab = hexToLab(shade.hex);
  if (chroma(lab) < 22 || shade.lrv > 35) return false;
  const h = labHue(lab);
  return h < 45 || h >= 240; // deep reds/pinks and blues/violets
}

/** Nearby shades that hold up better in the sun: lighter or less saturated. */
export function fadeSaferAlternatives(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
  n = 2,
): PaintShade[] {
  const seed = hexToLab(shade.hex);
  const seedHue = labHue(seed);
  return catalogue
    .filter((c) => {
      if (c.code === shade.code) return false;
      const lab = hexToLab(c.hex);
      if (hueDistance(labHue(lab), seedHue) > 30) return false;
      const lighter = c.lrv >= shade.lrv + 10;
      const calmer = chroma(lab) <= chroma(seed) - 8;
      return lighter || calmer;
    })
    .sort((a, b) => deltaE(hexToLab(a.hex), seed) - deltaE(hexToLab(b.hex), seed))
    .slice(0, n);
}

// ── Ceiling + trim pairing ─────────────────────────────────────────────────

export interface SurfacePairing {
  ceiling?: PaintShade;
  trim?: PaintShade;
}

const TINT_FOR_TEMP: Record<Temperature, ReadonlyArray<WhiteTint>> = {
  warm: ["warm", "pinkish", "neutral"],
  cool: ["cool", "greenish", "neutral"],
  neutral: ["neutral", "warm", "cool"],
};

/**
 * One ceiling white and one trim colour whose undertones sit comfortably with
 * the chosen wall shade: the ceiling is the brightest white on the wall's
 * warm/cool side; the trim is a quiet low-chroma colour with clear contrast
 * (darker trim for a light wall, lighter trim for a dark wall).
 */
export function pairCeilingAndTrim(
  shade: PaintShade,
  catalogue: ReadonlyArray<PaintShade>,
): SurfacePairing {
  const temp = temperature(shade.hex);
  const whites = catalogue.filter((s) => isWhiteShade(s) && s.code !== shade.code);
  const preferredTints = TINT_FOR_TEMP[temp];
  const ceiling =
    [...whites]
      .sort((a, b) => {
        const ra = preferredTints.indexOf(whiteTint(a.hex));
        const rb = preferredTints.indexOf(whiteTint(b.hex));
        const pa = ra === -1 ? 99 : ra;
        const pb = rb === -1 ? 99 : rb;
        return pa - pb || b.lrv - a.lrv;
      })[0];

  const trimTargetLrv = shade.lrv >= 50 ? 25 : 70;
  const trim =
    catalogue
      .filter((c) => {
        if (c.code === shade.code || c.code === ceiling?.code) return false;
        const lab = hexToLab(c.hex);
        if (chroma(lab) > 18) return false; // trim stays quiet
        const t = temperature(c.hex);
        return t === "neutral" || t === temp || temp === "neutral";
      })
      .sort(
        (a, b) => Math.abs(a.lrv - trimTargetLrv) - Math.abs(b.lrv - trimTargetLrv),
      )[0];

  return { ceiling, trim };
}

// ── Competitor-code closeness ──────────────────────────────────────────────

export type Closeness = "Very close" | "Close" | "Not exact";

/** Plain-words rating for a ΔE76 distance, for the counter screen. */
export function closenessRating(d: number): Closeness {
  if (d <= 3) return "Very close";
  if (d <= 6) return "Close";
  return "Not exact";
}
