/**
 * Room-palette suggestions for the studio's AI Suggest tab.
 *
 * <b>One colour per wall being painted.</b> A palette used to be a fixed main / accent /
 * trim trio, whatever the room actually had in it. That is right for the commonest room
 * and wrong for every other one: a customer who marked out a single feature wall was
 * handed three colours and had to work out which of them was for them, and a customer
 * with five surfaces was handed three and had to invent the other two. So a palette is
 * now sized to the job — hand in the walls, get back exactly that many shades, in the
 * same order, each built for the role its wall plays in the scheme.
 *
 * Every target is snapped to the nearest REAL catalogue shade (ΔE76), so a palette is
 * always orderable colours and never a made-up hex.
 */

import { hexToHsv, hsvToHex, nearestShades } from "./color";
import { isWhiteShade } from "./color-science";
import type { PaintShade, RegionKind } from "./types";

export interface Palette {
  name: string;
  rationale: string;
  /**
   * One shade per wall handed in, in the SAME order.
   *
   * The order is the contract: the caller passes its walls, and shades[i] is the colour
   * for walls[i]. That is what lets "Apply all" be a zip rather than a guess, and what
   * lets each swatch be labelled with the wall it is going on rather than with a role
   * vocabulary the customer never chose.
   */
  shades: PaintShade[];
}

/**
 * What a scheme is being asked for at one position.
 *
 * Coarser than {@link RegionKind} because a scheme cares about the JOB a surface does,
 * not what it is called: a hand-drawn region nobody has labelled and a third wall are
 * the same question — "another surface that has to sit with these".
 */
type Slot = "BODY" | "ACCENT" | "OTHER" | "TRIM";

const SLOT_FOR_KIND: Record<RegionKind, Slot> = {
  MAIN_WALL: "BODY",
  ACCENT_WALL: "ACCENT",
  OTHER_WALL: "OTHER",
  TRIM: "TRIM",
  // An unlabelled hand-drawn surface. Not BODY: promoting one to the scheme's main
  // colour is a decision, and the promotion below makes it only when nothing else
  // claims the role.
  MANUAL: "OTHER",
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function mk(h: number, s: number, v: number): string {
  return hsvToHex({ h: ((h % 360) + 360) % 360, s: clamp(s), v: clamp(v) });
}

/** Seed hues rotated through when no wall colour anchors the palettes. */
const SEED_HUES: ReadonlyArray<number> = [26, 210, 130, 350, 46, 270];

interface Scheme {
  name: string;
  rationale: string;
  /**
   * The target colour for one position.
   *
   * @param h    the scheme's hue, already nudged by the shuffle counter
   * @param s    the seed's saturation
   * @param slot what this position is for
   * @param nth  how many earlier positions asked for the same slot — 0 for the first.
   *             Two walls of one role must not come back the same colour, so each
   *             scheme steps the extras away from the first rather than repeating it.
   */
  target: (h: number, s: number, slot: Slot, nth: number) => string;
}

const SCHEMES: ReadonlyArray<Scheme> = [
  {
    name: "Tonal calm",
    rationale: "One hue at several depths — restful, and hard to get wrong.",
    target: (h, s, slot, nth) => {
      switch (slot) {
        case "BODY":
          return mk(h, Math.max(0.18, s * 0.55), 0.78 - nth * 0.1);
        case "ACCENT":
          return mk(h, clamp(Math.max(s, 0.3) * 1.15, 0.25, 0.8), 0.42 - nth * 0.07);
        // Between the body and the accent, and a step deeper for each extra wall —
        // which is exactly what "one hue at several depths" means once there are
        // more than three surfaces to spend it on.
        case "OTHER":
          return mk(h, Math.max(0.16, s * 0.7), 0.66 - nth * 0.09);
        case "TRIM":
          return mk(h, 0.07 + nth * 0.03, 0.95 - nth * 0.05);
      }
    },
  },
  {
    name: "Soft contrast",
    rationale: "Neighbouring hues keep the room lively but easy to live with.",
    target: (h, s, slot, nth) => {
      switch (slot) {
        case "BODY":
          return mk(h, Math.max(0.15, s * 0.45), 0.85 - nth * 0.08);
        case "ACCENT":
          return mk(h + 32, clamp(Math.max(s, 0.35), 0.3, 0.7), 0.5 - nth * 0.06);
        // Walks further round the wheel for each extra wall, so a five-wall room
        // reads as a related family rather than as one colour repeated.
        case "OTHER":
          return mk(h + 16 + nth * 18, Math.max(0.14, s * 0.4), 0.74 - nth * 0.07);
        case "TRIM":
          return mk(h + 16, 0.06 + nth * 0.03, 0.94 - nth * 0.05);
      }
    },
  },
  {
    name: "Bold accent",
    rationale: "Quiet walls with one wall that does the talking.",
    target: (h, s, slot, nth) => {
      switch (slot) {
        case "BODY":
          return mk(h, 0.1, 0.92 - nth * 0.06);
        case "ACCENT":
          return mk(h + 180, clamp(Math.max(s, 0.45), 0.35, 0.8), 0.4 - nth * 0.06);
        // Deliberately quiet. The whole scheme is one wall doing the talking, so the
        // extra walls stay near the body — a second loud wall would undo it.
        case "OTHER":
          return mk(h, 0.12 + nth * 0.02, 0.84 - nth * 0.07);
        case "TRIM":
          return mk(h, 0.05 + nth * 0.03, 0.96 - nth * 0.05);
      }
    },
  },
  {
    name: "Heritage depth",
    rationale: "Deep, muted walls with a soft light trim — evening rooms love it.",
    target: (h, s, slot, nth) => {
      switch (slot) {
        case "BODY":
          return mk(h, clamp(Math.max(s, 0.3) * 0.85, 0.2, 0.7), 0.5 - nth * 0.07);
        case "ACCENT":
          return mk(h - 24, clamp(Math.max(s, 0.35), 0.3, 0.75), 0.32 - nth * 0.05);
        case "OTHER":
          return mk(h - 12 * (nth + 1), clamp(Math.max(s, 0.3) * 0.8, 0.18, 0.65), 0.6 - nth * 0.08);
        case "TRIM":
          return mk(h, 0.08 + nth * 0.03, 0.93 - nth * 0.05);
      }
    },
  },
];

/** The default shape when a caller names no walls: the main / accent / trim trio. */
const DEFAULT_ROLES: ReadonlyArray<RegionKind> = ["MAIN_WALL", "ACCENT_WALL", "TRIM"];

/**
 * Nearest unused catalogue shade to a target hex; undefined if the pool is spent.
 *
 * `depth` is how far down the ΔE ranking it may look before giving up. It scales with
 * the number of walls, because every slot filled removes a candidate from the next
 * slot's reach: a fixed five was ample for a trio and would leave a six-wall palette
 * unfillable on a small catalogue.
 */
function snap(
  target: string,
  pool: ReadonlyArray<PaintShade>,
  used: Set<string>,
  depth: number,
): PaintShade | undefined {
  for (const { shade } of nearestShades(target, pool, depth)) {
    if (used.has(shade.code)) continue;
    used.add(shade.code);
    return shade;
  }
  return undefined;
}

/**
 * One palette per scheme, each holding one shade per wall in `roles`.
 *
 * `seedHex` anchors every scheme to the wall's colour; without it the schemes build
 * around a rotating designer seed. `variant` (the Shuffle counter) nudges an anchored hue
 * a little each press, and jumps an unanchored seed to the next hue entirely.
 *
 * `roles` is the walls being painted, in the order the caller wants the colours back —
 * pass three and it behaves exactly as it always did. A palette that cannot fill every
 * one of its positions with a distinct catalogue shade is dropped rather than returned
 * short, so the count the customer is promised is the count they get.
 */
export function generatePalettes(
  catalogue: ReadonlyArray<PaintShade>,
  seedHex?: string,
  variant = 0,
  roles: ReadonlyArray<RegionKind> = DEFAULT_ROLES,
): Palette[] {
  if (catalogue.length === 0 || roles.length === 0) return [];

  const anchored = Boolean(seedHex);
  const base = seedHex ? hexToHsv(seedHex) : { h: SEED_HUES[variant % SEED_HUES.length]!, s: 0.5, v: 0.6 };
  const hue = anchored ? base.h + variant * 18 : base.h;

  // Trim wants a true white when the catalogue has one.
  const whites = catalogue.filter(isWhiteShade);
  const trimPool = whites.length > 0 ? whites : catalogue;

  // What each position is asking for, resolved once for every scheme.
  //
  // The promotion is the reason this is not a plain map: a scheme is built outwards from
  // its body colour, so a plan with no main wall in it — one hand-drawn feature wall, a
  // room of trim — would otherwise get a palette of supporting colours and no lead. The
  // first wall takes the role when nothing else claims it, which for a single-wall plan
  // means the one colour offered is the scheme's own answer rather than a bit part.
  const slots = roles.map((kind) => SLOT_FOR_KIND[kind] ?? "OTHER");
  if (!slots.includes("BODY")) slots[0] = "BODY";

  const depth = Math.max(5, roles.length + 4);

  const out: Palette[] = [];
  for (const scheme of SCHEMES) {
    const used = new Set<string>();
    const seenPerSlot = new Map<Slot, number>();
    const shades: PaintShade[] = [];
    for (const slot of slots) {
      const nth = seenPerSlot.get(slot) ?? 0;
      seenPerSlot.set(slot, nth + 1);
      const target = scheme.target(hue, base.s, slot, nth);
      const shade =
        slot === "TRIM"
          ? (snap(target, trimPool, used, depth) ?? snap(target, catalogue, used, depth))
          : snap(target, catalogue, used, depth);
      if (!shade) break;
      shades.push(shade);
    }
    if (shades.length === slots.length) {
      out.push({ name: scheme.name, rationale: scheme.rationale, shades });
    }
  }
  return out;
}
