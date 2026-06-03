import { describe, it, expect } from "vitest";
import { suggestForRole } from "../harmony";
import { SHADES } from "../shades";

describe("suggestForRole", () => {
  it("returns real catalogue shades for the main wall", () => {
    const out = suggestForRole("#a47148", "MAIN_WALL", SHADES, 4);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
    // Every suggestion is a real catalogue entry.
    for (const s of out) {
      expect(SHADES.some((c) => c.code === s.code)).toBe(true);
    }
  });

  it("excludes already-applied codes", () => {
    const exclude = [SHADES[0]!.code, SHADES[5]!.code];
    const out = suggestForRole("#a47148", "ACCENT_WALL", SHADES, 4, exclude);
    for (const s of out) expect(exclude).not.toContain(s.code);
  });

  it("returns no duplicates within a group", () => {
    const out = suggestForRole("#5b6c5b", "TRIM", SHADES, 4);
    const codes = out.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is empty for an empty catalogue", () => {
    expect(suggestForRole("#a47148", "MAIN_WALL", [], 4)).toEqual([]);
  });
});
