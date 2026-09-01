import { describe, expect, it } from "vitest";
import { generatePalettes } from "../palettes";
import { SHADES } from "../shades";

describe("generatePalettes", () => {
  it("returns one palette per scheme, each with three distinct real shades", () => {
    const palettes = generatePalettes(SHADES);
    expect(palettes.length).toBeGreaterThanOrEqual(3);
    for (const p of palettes) {
      const codes = p.shades.map((s) => s.code);
      // All real catalogue entries…
      for (const code of codes) {
        expect(SHADES.some((s) => s.code === code)).toBe(true);
      }
      // …and no wall repeats a colour within the palette.
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
    const flat = (ps: typeof a) => ps.map((p) => p.shades.map((s) => s.code).join()).join("|");
    expect(flat(a)).not.toEqual(flat(b));
  });

  it("returns an empty list for an empty catalogue", () => {
    expect(generatePalettes([])).toEqual([]);
  });

  /**
   * The whole point of the rewrite. A room's palette is as long as the room's list of
   * walls — one mask means one colour to choose, five masks means five — because the
   * alternative is handing somebody with one feature wall a trio and letting them work
   * out which third of it was for them.
   */
  it("returns exactly one distinct shade per wall, however many walls there are", () => {
    for (let n = 1; n <= 6; n++) {
      const roles = Array.from({ length: n }, (_, i) =>
        i === 0 ? ("MAIN_WALL" as const) : i === 1 ? ("ACCENT_WALL" as const) : ("OTHER_WALL" as const),
      );
      const palettes = generatePalettes(SHADES, "#A47148", 0, roles);
      expect(palettes.length).toBeGreaterThan(0);
      for (const p of palettes) {
        expect(p.shades).toHaveLength(n);
        expect(new Set(p.shades.map((s) => s.code)).size).toBe(n);
      }
    }
  });

  /**
   * A plan with no main wall in it — one hand-drawn feature wall, or a room of trim —
   * still gets a lead colour rather than a palette of supporting parts. The first wall
   * takes the role when nothing else claims it.
   */
  it("gives a single unlabelled wall the scheme's own lead colour", () => {
    const lead = generatePalettes(SHADES, "#A47148", 0, ["MANUAL"]);
    const asMain = generatePalettes(SHADES, "#A47148", 0, ["MAIN_WALL"]);
    expect(lead).toEqual(asMain);
    for (const p of lead) expect(p.shades).toHaveLength(1);
  });

  /** Two walls of the same role are two different colours, not one colour twice. */
  it("separates two walls that share a role", () => {
    const [first] = generatePalettes(SHADES, "#A47148", 0, ["MAIN_WALL", "OTHER_WALL", "OTHER_WALL"]);
    expect(first).toBeDefined();
    expect(new Set(first!.shades.map((s) => s.code)).size).toBe(3);
  });
});
