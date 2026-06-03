import { describe, it, expect } from "vitest";
import { hexToRgb, rgbToHex, hexToLab, deltaE, nearestShade, hsvToHex, hexToHsv } from "../color";

describe("color conversions", () => {
  it("round-trips hex → rgb → hex", () => {
    expect(rgbToHex(hexToRgb("#a47148"))).toBe("#a47148");
  });

  it("parses 3-digit hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("deltaE of a colour with itself is ~0", () => {
    const lab = hexToLab("#5b6c5b");
    expect(deltaE(lab, lab)).toBeCloseTo(0, 5);
  });

  it("nearestShade picks the perceptually closest", () => {
    const pool = [{ hex: "#ffffff" }, { hex: "#000000" }, { hex: "#a07050" }];
    expect(nearestShade("#a47148", pool)?.hex).toBe("#a07050");
  });

  it("hsv round-trips for a saturated colour", () => {
    const hex = "#3a4870";
    expect(hsvToHex(hexToHsv(hex)).toLowerCase()).toBe(hex);
  });
});
