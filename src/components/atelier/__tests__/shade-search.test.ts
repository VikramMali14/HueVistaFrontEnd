// @vitest-environment node
/**
 * Search must match what the user can actually read on the swatch.
 *
 * A shop running its own numbering shows only its codes; if search kept matching
 * the manufacturer's, the one code on screen would be the one code that finds
 * nothing. And a name the shop has hidden must not be searchable — a hit on it
 * would answer a question the shop chose not to answer.
 */
import { describe, it, expect } from "vitest";
import { matchesQuery } from "../shade-grid";
import { encodeShadeCode } from "@/lib/shade-codes";

const IVORY = { name: "Ivory Mist", code: "L124", hex: "#f3ece1" };

// prefix AB, pair XY, suffix CD → L124 reads as ABL1XY24CD
const scheme = { prefix: "AB", infix: "XY", suffix: "CD" };
const encodeCode = (code: string) => encodeShadeCode(scheme, code);

describe("matchesQuery", () => {
  it("matches everything until something is typed", () => {
    expect(matchesQuery(IVORY, "")).toBe(true);
    expect(matchesQuery(IVORY, "   ")).toBe(true);
  });

  it("matches name, code and hex with no shop pattern", () => {
    expect(matchesQuery(IVORY, "ivory")).toBe(true);
    expect(matchesQuery(IVORY, "l124")).toBe(true);
    expect(matchesQuery(IVORY, "f3ece1")).toBe(true);
    expect(matchesQuery(IVORY, "berger")).toBe(false);
  });

  it("finds a shade by the shop code shown on its swatch", () => {
    const opts = { hideCodes: true, encodeCode };
    expect(matchesQuery(IVORY, "ABL1XY24CD", opts)).toBe(true);
    expect(matchesQuery(IVORY, "abl1xy24cd", opts)).toBe(true);
  });

  it("stops matching the manufacturer's code once the shop replaces it", () => {
    expect(matchesQuery(IVORY, "l124", { hideCodes: true, encodeCode })).toBe(false);
  });

  it("stops matching a name the shop hides", () => {
    expect(matchesQuery(IVORY, "ivory", { hideNames: true, hideCodes: true, encodeCode })).toBe(false);
    // …while the shop's own code still finds it.
    expect(matchesQuery(IVORY, "ABL1XY24CD", { hideNames: true, hideCodes: true, encodeCode })).toBe(true);
  });

  it("keeps names searchable when only the codes are replaced", () => {
    expect(matchesQuery(IVORY, "ivory", { hideCodes: true, encodeCode })).toBe(true);
  });
});
