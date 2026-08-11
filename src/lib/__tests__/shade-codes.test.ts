import { describe, expect, it } from "vitest";
import {
  decodeShadeCode,
  encodeShadeCode,
  hasScheme,
  normalizeSchemePart,
  schemeTimeline,
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
    for (const code of ["L124", "9436", "HV-X", "K", "0090"]) {
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

describe("schemeTimeline", () => {
  // A shop that turned codes on in January, changed the pattern in March, and
  // changed it again in August. The windows are never stored — only the moment each
  // pattern was retired is — so the chain has to reconstruct them.
  const scheme: ShadeCodeScheme = {
    prefix: "CC", infix: "", suffix: "",
    firstSetAt: "2026-01-10T09:00:00",
    updatedAt: "2026-08-08T11:20:00",
    retired: [
      { prefix: "BB", infix: "XY", suffix: "", retiredAt: "2026-08-08T11:20:00" },
      { prefix: "AA", infix: "", suffix: "ZZ", retiredAt: "2026-03-02T16:05:00" },
    ],
  };

  it("chains each window from the retirement of the one before it", () => {
    const t = schemeTimeline(scheme);

    expect(t).toHaveLength(3);
    // Newest first — the counter reads the current pattern before an old one.
    expect(t[0]).toMatchObject({ prefix: "CC", live: true, from: "2026-08-08T11:20:00", to: null });
    expect(t[1]).toMatchObject({ prefix: "BB", live: false, from: "2026-03-02T16:05:00", to: "2026-08-08T11:20:00" });
    // The oldest is anchored by when the shop first switched codes on; without that
    // its window would have to begin at "unknown".
    expect(t[2]).toMatchObject({ prefix: "AA", live: false, from: "2026-01-10T09:00:00", to: "2026-03-02T16:05:00" });
  });

  it("leaves the live pattern open-ended", () => {
    expect(schemeTimeline(scheme)[0]!.to).toBeNull();
  });

  it("falls back to updatedAt for a shop that has never changed its pattern", () => {
    const t = schemeTimeline({ prefix: "AB", infix: "", suffix: "", updatedAt: "2026-02-01T10:00:00" });

    expect(t).toEqual([
      { prefix: "AB", infix: "", suffix: "", from: "2026-02-01T10:00:00", to: null, live: true },
    ]);
  });

  it("still orders correctly when the wire order is not newest-first", () => {
    const t = schemeTimeline({ ...scheme, retired: [...scheme.retired!].reverse() });

    expect(t.map((p) => p.prefix)).toEqual(["CC", "BB", "AA"]);
  });

  it("lists retired patterns even after the shop turns codes off entirely", () => {
    // Clearing the pattern deletes the live row but not the history: codes printed
    // under it are still in customers' hands and still have to be readable.
    const t = schemeTimeline({ prefix: "", infix: "", suffix: "", retired: scheme.retired });

    expect(t.every((p) => !p.live)).toBe(true);
    expect(t.map((p) => p.prefix)).toEqual(["BB", "AA"]);
  });

  it("is empty when there is no scheme at all", () => {
    expect(schemeTimeline(null)).toEqual([]);
    expect(schemeTimeline({ prefix: "", infix: "", suffix: "" })).toEqual([]);
  });
});
