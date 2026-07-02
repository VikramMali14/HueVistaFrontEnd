import { describe, expect, it } from "vitest";
import { generatePalettes } from "../palettes";
import { SHADES } from "../shades";

describe("generatePalettes", () => {
  it("returns one palette per scheme, each with three distinct real shades", () => {
    const palettes = generatePalettes(SHADES);
    expect(palettes.length).toBeGreaterThanOrEqual(3);
    for (const p of palettes) {
      const codes = [p.main.code, p.accent.code, p.trim.code];
      // All real catalogue entries…
      for (const code of codes) {
        expect(SHADES.some((s) => s.code === code)).toBe(true);
      }
      // …and no role repeats a colour within the palette.
      expect(new Set(codes).size).toBe(3);
      expect(p.name).toBeTruthy();
      expect(p.rationale).toBeTruthy();
    }
  });

  it("is deterministic for the same seed and variant", () => {
    const a = generatePalettes(SHADES, "#A47148", 0);
    const b = generatePalettes(SHADES, "#A47148", 0);
    expect(a).toEqual(b);
  });

  it("shuffling the variant changes at least one suggestion", () => {
    const a = generatePalettes(SHADES, undefined, 0);
    const b = generatePalettes(SHADES, undefined, 1);
    const flat = (ps: typeof a) => ps.map((p) => [p.main.code, p.accent.code, p.trim.code].join()).join("|");
    expect(flat(a)).not.toEqual(flat(b));
  });

  it("returns an empty list for an empty catalogue", () => {
    expect(generatePalettes([])).toEqual([]);
  });
});
