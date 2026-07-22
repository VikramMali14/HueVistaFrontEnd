// @vitest-environment node
/**
 * The opening 3-colour scheme must come from ONE real paint company. This checks
 * the brand picker: prefer the configured brand ("Asian Paints"), fall back to
 * the best-stocked brand when a shop doesn't carry it, and stay undefined for an
 * empty catalogue.
 */
import { describe, it, expect } from "vitest";
import type { PaintShade } from "@/lib/types";
import { pickOpeningBrand } from "../visualizer";

const shade = (code: string, brand: string): PaintShade => ({
  code,
  name: code,
  hex: "#cccccc",
  family: "Neutrals",
  lrv: 50,
  brand,
  finishes: [],
});

describe("pickOpeningBrand", () => {
  it("prefers the configured opening brand when the catalogue stocks it", () => {
    const catalogue = [shade("A1", "Berger"), shade("A2", "Asian Paints"), shade("A3", "Berger")];
    // Even though Berger has more shades, the configured brand wins when present.
    expect(pickOpeningBrand(catalogue)).toBe("Asian Paints");
  });

  it("falls back to the best-stocked single brand when the configured one is absent", () => {
    const catalogue = [shade("B1", "Berger"), shade("B2", "Nerolac"), shade("B3", "Berger")];
    expect(pickOpeningBrand(catalogue)).toBe("Berger");
  });

  it("is undefined for an empty catalogue", () => {
    expect(pickOpeningBrand([])).toBeUndefined();
  });
});
