import { describe, expect, it } from "vitest";
import {
  decodeShadeCode,
  encodeShadeCode,
  hasScheme,
  normalizeSchemePart,
  type ShadeCodeScheme,
} from "../shade-codes";

const FULL: ShadeCodeScheme = { prefix: "AB", infix: "XY", suffix: "CD" };

describe("encodeShadeCode", () => {
  it("splices prefix, pair-after-two and suffix around the code", () => {
    expect(encodeShadeCode(FULL, "L124")).toBe("ABL1XY24CD");
  });

  it("works with any subset of parts", () => {
    expect(encodeShadeCode({ prefix: "SP", infix: "", suffix: "" }, "L124")).toBe("SPL124");
    expect(encodeShadeCode({ prefix: "", infix: "9Z", suffix: "" }, "L124")).toBe("L19Z24");
    expect(encodeShadeCode({ prefix: "", infix: "", suffix: "77" }, "L124")).toBe("L12477");
  });

  it("keeps the pair after a short code instead of dropping it", () => {
    expect(encodeShadeCode(FULL, "L")).toBe("ABLXYCD");
  });

  it("passes empty input through", () => {
    expect(encodeShadeCode(FULL, "  ")).toBe("");
  });
});

describe("decodeShadeCode", () => {
  it("reverses the full scheme", () => {
    expect(decodeShadeCode(FULL, "ABL1XY24CD")).toBe("L124");
  });

  it("round-trips whatever encode produced", () => {
    for (const code of ["L124", "9436", "AP-X", "K", "0090"]) {
      const scheme: ShadeCodeScheme = { prefix: "Z9", infix: "Q", suffix: "END" };
      expect(decodeShadeCode(scheme, encodeShadeCode(scheme, code))).toBe(code.toUpperCase());
    }
  });

  it("is case-insensitive on input", () => {
    expect(decodeShadeCode(FULL, "abl1xy24cd")).toBe("L124");
  });

  it("rejects values that do not follow the scheme", () => {
    expect(decodeShadeCode(FULL, "L124")).toBeNull(); // no prefix
    expect(decodeShadeCode(FULL, "ABL12400")).toBeNull(); // wrong suffix
    expect(decodeShadeCode(FULL, "ABL1QQ24CD")).toBeNull(); // wrong pair
    expect(decodeShadeCode(FULL, "")).toBeNull();
  });

  it("round-trips short codes", () => {
    expect(decodeShadeCode(FULL, encodeShadeCode(FULL, "L"))).toBe("L");
  });
});

describe("scheme helpers", () => {
  it("normalizes parts to trimmed uppercase within the limit", () => {
    expect(normalizeSchemePart("  abcde ", 4)).toBe("ABCD");
  });

  it("treats all-empty as no scheme", () => {
    expect(hasScheme({ prefix: "", infix: "", suffix: "" })).toBe(false);
    expect(hasScheme({ prefix: "A", infix: "", suffix: "" })).toBe(true);
    expect(hasScheme(null)).toBe(false);
  });
});
