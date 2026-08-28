/**
 * The customer's code names a company the shop does not sell. Everything here is
 * about not answering that with silence, and not answering it with a guess.
 */
import { describe, it, expect } from "vitest";
import { crossBrandLookup, nearestPerCompany } from "../cross-brand";
import type { PaintShade } from "../types";

const shade = (over: Partial<PaintShade> & Pick<PaintShade, "code" | "hex" | "brand">): PaintShade => ({
  name: "Test",
  family: "Neutrals",
  lrv: 60,
  finishes: [],
  ...over,
});

// The story the whole feature exists for: an Asian Paints code, a HueVista shop.
const ASIAN_L124 = shade({
  code: "L124",
  name: "Ivory Mist",
  hex: "#f3ece1",
  brand: "Asian Paints",
  hvCode: "HV0348",
});
const HUEVISTA_H101 = shade({ code: "H101", name: "Ivory White", hex: "#f3ece1", brand: "HueVista" });
const HUEVISTA_H900 = shade({ code: "H900", name: "Deep Ink", hex: "#101820", brand: "HueVista", lrv: 4 });
const BERGER_B220 = shade({ code: "B220", name: "Cream Pearl", hex: "#efe4d4", brand: "Berger" });

const ALL = [ASIAN_L124, HUEVISTA_H101, HUEVISTA_H900, BERGER_B220];
const HUEVISTA_ONLY = [HUEVISTA_H101, HUEVISTA_H900];

describe("crossBrandLookup", () => {
  it("answers another company's code with the nearest shade on screen", () => {
    const r = crossBrandLookup("L124", HUEVISTA_ONLY, ALL);
    expect(r?.kind).toBe("match");
    if (r?.kind !== "match") throw new Error("expected a match");
    expect(r.source).toBe(ASIAN_L124);
    expect(r.matches[0]?.shade).toBe(HUEVISTA_H101);
  });

  it("says the same colour is the same colour, and never on a near miss", () => {
    const r = crossBrandLookup("L124", HUEVISTA_ONLY, ALL);
    if (r?.kind !== "match") throw new Error("expected a match");
    // Identical hex — the shop carries the very colour, not an approximation.
    expect(r.matches[0]?.exact).toBe(true);
    expect(r.matches[0]?.deltaE).toBe(0);

    const near = crossBrandLookup("L124", [BERGER_B220], ALL);
    if (near?.kind !== "match") throw new Error("expected a match");
    expect(near.matches[0]?.exact).toBe(false);
    expect(near.matches[0]?.deltaE).toBeGreaterThan(0);
  });

  it("reads the code however the customer is carrying it", () => {
    // Codes are printed and read in upper case; typing is not.
    expect(crossBrandLookup("l124", HUEVISTA_ONLY, ALL)?.kind).toBe("match");
    expect(crossBrandLookup("  L124  ", HUEVISTA_ONLY, ALL)?.kind).toBe("match");
    // A HueVista code off the customer's own board resolves to the same colour.
    const viaHv = crossBrandLookup("HV0348", HUEVISTA_ONLY, ALL);
    if (viaHv?.kind !== "match") throw new Error("expected a match");
    expect(viaHv.source).toBe(ASIAN_L124);
    expect(viaHv.viaHvCode).toBe(true);
  });

  it("offers one shade per company, closest company first", () => {
    const r = crossBrandLookup("L124", [HUEVISTA_H900, HUEVISTA_H101, BERGER_B220], ALL);
    if (r?.kind !== "match") throw new Error("expected a match");
    // HueVista appears once — its nearest, not both of its shades.
    expect(r.matches.map((m) => m.shade.brand)).toEqual(["HueVista", "Berger"]);
    expect(r.matches[0]?.shade).toBe(HUEVISTA_H101);
  });

  it("asks which company rather than guessing when a code is shared", () => {
    const nerolacL124 = shade({ code: "L124", name: "Sea Foam", hex: "#cfe3dd", brand: "Nerolac" });
    const r = crossBrandLookup("L124", HUEVISTA_ONLY, [...ALL, nerolacL124]);
    expect(r?.kind).toBe("ambiguous");
    if (r?.kind !== "ambiguous") throw new Error("expected ambiguity");
    // Naming one would quote a real shade from the wrong company, which reads
    // exactly like a correct answer.
    expect(r.candidates.map((c) => c.brand)).toEqual(["Asian Paints", "Nerolac"]);
  });

  it("stays quiet when the grid below is already the answer", () => {
    // Nothing typed, a partial code, a name, a code nobody carries.
    expect(crossBrandLookup("", HUEVISTA_ONLY, ALL)).toBeNull();
    expect(crossBrandLookup("L", HUEVISTA_ONLY, ALL)).toBeNull();
    expect(crossBrandLookup("Ivory", HUEVISTA_ONLY, ALL)).toBeNull();
    expect(crossBrandLookup("ZZ999", HUEVISTA_ONLY, ALL)).toBeNull();
    // A partial code must not resolve: "L12" is not L124.
    expect(crossBrandLookup("L12", HUEVISTA_ONLY, ALL)).toBeNull();
    // The code's own company is the only one on screen, so its swatch is in the grid.
    expect(crossBrandLookup("L124", [ASIAN_L124], ALL)).toBeNull();
  });

  it("caps how many companies it answers with", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      shade({ code: `X${i}`, hex: "#f3ece1", brand: `Company ${i}` }),
    );
    const r = crossBrandLookup("L124", many, [...ALL, ...many], { maxCompanies: 3 });
    if (r?.kind !== "match") throw new Error("expected a match");
    expect(r.matches).toHaveLength(3);
  });
});

describe("nearestPerCompany", () => {
  it("never lists a colour as an alternative to itself", () => {
    const r = nearestPerCompany(HUEVISTA_H101, [HUEVISTA_H101, HUEVISTA_H900, BERGER_B220]);
    // The pool carries H101 already, so its swatch is in the grid and its whole
    // company is dropped from the band rather than repeated under it.
    expect(r.map((m) => m.shade.brand)).toEqual(["Berger"]);
  });

  it("still offers the code's own company what it does stock", () => {
    // A shop that carries Asian Paints but not L124: "the nearest Asian Paints we
    // have" is the best answer on the shelf, not a disqualified one.
    const asianOther = shade({ code: "L900", name: "Warm Sand", hex: "#efe6d8", brand: "Asian Paints" });
    const r = nearestPerCompany(ASIAN_L124, [asianOther, HUEVISTA_H900]);
    expect(r[0]?.shade).toBe(asianOther);
  });

  it("skips shades with no usable colour rather than measuring against nothing", () => {
    const broken = shade({ code: "B1", hex: "", brand: "Broken" });
    const r = nearestPerCompany(ASIAN_L124, [broken, HUEVISTA_H101]);
    expect(r.map((m) => m.shade.brand)).toEqual(["HueVista"]);
    expect(nearestPerCompany(shade({ code: "X", hex: "nope", brand: "X" }), [HUEVISTA_H101])).toEqual([]);
  });
});
