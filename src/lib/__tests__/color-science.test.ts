import { describe, it, expect } from "vitest";
import {
  closenessRating,
  DARK_ROOM_LRV,
  fadeSaferAlternatives,
  fanDeck,
  hueDistance,
  isWhiteShade,
  lighterSteps,
  lightShift,
  pairCeilingAndTrim,
  stepInFanDeck,
  sunFadeRisk,
  temperature,
  undertone,
  undertoneClash,
  whiteTint,
} from "../color-science";
import { SHADES } from "../shades";
import type { PaintShade } from "../types";

const byCode = (code: string): PaintShade => {
  const s = SHADES.find((x) => x.code === code);
  if (!s) throw new Error(`missing test shade ${code}`);
  return s;
};

describe("hueDistance", () => {
  it("wraps around the circle", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });
});

describe("undertone", () => {
  it("classifies obvious directions", () => {
    expect(undertone("#c98a96")).toBe("pinkish"); // rosy
    expect(undertone("#a47148")).toBe("peachy"); // terracotta
    expect(undertone("#c9b36a")).toBe("yellowish");
    expect(undertone("#7b8a72")).toBe("greenish"); // sage
    expect(undertone("#3a4870")).toBe("bluish"); // indigo
  });
  it("calls near-greys neutral", () => {
    expect(undertone("#808080")).toBe("neutral");
    expect(undertone("#8c98a8")).not.toBe("neutral"); // pewter leans blue
  });
});

describe("temperature", () => {
  it("splits warm and cool", () => {
    expect(temperature("#a47148")).toBe("warm");
    expect(temperature("#3a4870")).toBe("cool");
    expect(temperature("#808080")).toBe("neutral");
  });
});

describe("undertoneClash", () => {
  it("flags a saturated warm against a saturated cool", () => {
    const v = undertoneClash("#b96b48", "#3a4870"); // terracotta vs indigo
    expect(v.clash).toBe(true);
    expect(v.reason).toBeTruthy();
  });
  it("does not flag two warm shades", () => {
    expect(undertoneClash("#b96b48", "#c9a17a").clash).toBe(false);
  });
  it("does not flag anything against a true grey", () => {
    expect(undertoneClash("#808080", "#3a4870").clash).toBe(false);
  });
  it("flags two whites whose tints pull different ways", () => {
    // Warm ivory vs blue-leaning white.
    const v = undertoneClash("#f3eee4", "#eef1f6");
    expect(v.clash).toBe(true);
  });
  it("does not flag two warm whites", () => {
    expect(undertoneClash("#f3eee4", "#ebe5d7").clash).toBe(false);
  });
});

describe("whiteTint / isWhiteShade", () => {
  it("reads the hidden tint of whites", () => {
    expect(whiteTint("#f3eee4")).toBe("warm"); // Bone China leans yellow
    expect(whiteTint("#eef1f6")).toBe("cool");
    expect(whiteTint("#f5f5f5")).toBe("neutral");
  });
  it("treats the Whites family and bright low-chroma shades as whites", () => {
    expect(isWhiteShade(byCode("AP-N101"))).toBe(true); // Bone China
    expect(isWhiteShade(byCode("AP-3318"))).toBe(false); // Oxblood
  });
});

describe("lighterSteps", () => {
  it("offers meaningfully lighter shades of a similar colour", () => {
    const dark = byCode("AP-7720"); // Olive Branch, LRV 18
    const steps = lighterSteps(dark, SHADES, 2);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(s.lrv).toBeGreaterThanOrEqual(dark.lrv + 8);
      expect(s.code).not.toBe(dark.code);
    }
    // Lightest step first means closest LRV above the seed first.
    if (steps.length === 2) expect(steps[0]!.lrv).toBeLessThanOrEqual(steps[1]!.lrv);
  });
  it("respects the dark-room threshold constant", () => {
    expect(DARK_ROOM_LRV).toBeGreaterThan(0);
    expect(DARK_ROOM_LRV).toBeLessThan(50);
  });
});

describe("fanDeck / stepInFanDeck", () => {
  it("returns a lightest-first strip containing the seed", () => {
    const seed = byCode("AP-7706"); // Sage Whisper
    const strip = fanDeck(seed, SHADES, 9);
    expect(strip.some((s) => s.code === seed.code)).toBe(true);
    for (let i = 1; i < strip.length; i++) {
      expect(strip[i - 1]!.lrv).toBeGreaterThanOrEqual(strip[i]!.lrv);
    }
  });
  it("steps lighter and darker from the seed", () => {
    const seed = byCode("AP-7706");
    const lighter = stepInFanDeck(seed, SHADES, -1);
    const darker = stepInFanDeck(seed, SHADES, 1);
    if (lighter) expect(lighter.lrv).toBeGreaterThanOrEqual(seed.lrv);
    if (darker) expect(darker.lrv).toBeLessThanOrEqual(seed.lrv);
    expect(lighter || darker).toBeTruthy();
  });
});

describe("lightShift", () => {
  it("moves a saturated teal more than a grey", () => {
    const teal = lightShift("#2a8f86");
    const grey = lightShift("#8a8a8a");
    expect(teal.score).toBeGreaterThan(grey.score);
    expect(grey.score).toBeLessThan(2);
    expect(teal.warmHex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("sunFadeRisk / fadeSaferAlternatives", () => {
  it("flags deep saturated reds and blues, not pale calm shades", () => {
    expect(sunFadeRisk(byCode("AP-3318"))).toBe(true); // Oxblood
    expect(sunFadeRisk(byCode("AP-7711"))).toBe(false); // Pale Sage
    expect(sunFadeRisk(byCode("AP-N101"))).toBe(false); // Bone China
  });
  it("suggests lighter or calmer neighbours", () => {
    const risky = byCode("AP-3318");
    const alts = fadeSaferAlternatives(risky, SHADES, 2);
    for (const a of alts) {
      expect(a.code).not.toBe(risky.code);
    }
  });
});

describe("pairCeilingAndTrim", () => {
  it("pairs a warm wall with a warm-side white ceiling and a quiet trim", () => {
    const wall = byCode("AP-2118"); // Terracotta, warm
    const { ceiling, trim } = pairCeilingAndTrim(wall, SHADES);
    expect(ceiling).toBeTruthy();
    expect(isWhiteShade(ceiling!)).toBe(true);
    expect(["warm", "pinkish", "neutral"]).toContain(whiteTint(ceiling!.hex));
    expect(trim).toBeTruthy();
    expect(trim!.code).not.toBe(wall.code);
    expect(trim!.code).not.toBe(ceiling!.code);
  });
  it("gives a dark wall a lighter trim and a light wall a darker trim", () => {
    const dark = byCode("AP-3304"); // Walnut, LRV 14
    const light = byCode("AP-N105"); // Ivory Coast, LRV 82
    const darkPair = pairCeilingAndTrim(dark, SHADES);
    const lightPair = pairCeilingAndTrim(light, SHADES);
    expect(darkPair.trim!.lrv).toBeGreaterThan(dark.lrv);
    expect(lightPair.trim!.lrv).toBeLessThan(light.lrv);
  });
});

describe("closenessRating", () => {
  it("maps ΔE to honest counter words", () => {
    expect(closenessRating(0)).toBe("Very close");
    expect(closenessRating(3)).toBe("Very close");
    expect(closenessRating(4.5)).toBe("Close");
    expect(closenessRating(6)).toBe("Close");
    expect(closenessRating(9)).toBe("Not exact");
  });
});
