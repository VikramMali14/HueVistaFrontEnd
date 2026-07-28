import { describe, it, expect } from "vitest";
import { formatPoints, formatRupees, parseRupeesToPaise } from "../money";

describe("formatRupees", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatRupees(7900)).toBe("₹79");
    expect(formatRupees(5000)).toBe("₹50");
  });

  it("formats fractional rupees to two decimals", () => {
    expect(formatRupees(7950)).toBe("₹79.50");
    expect(formatRupees(101)).toBe("₹1.01");
  });

  it("groups large amounts Indian-style", () => {
    expect(formatRupees(10_00_000_00)).toBe("₹10,00,000");
  });
});

describe("parseRupeesToPaise", () => {
  it("parses plain rupees", () => {
    expect(parseRupeesToPaise("79")).toBe(7900);
  });

  it("parses decimals up to two places", () => {
    expect(parseRupeesToPaise("79.5")).toBe(7950);
    expect(parseRupeesToPaise("79.55")).toBe(7955);
  });

  it("tolerates the ₹ sign, commas and spaces", () => {
    expect(parseRupeesToPaise("₹ 1,079")).toBe(107900);
  });

  it("rejects junk, negatives and sub-paise precision", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("-5")).toBeNull();
    expect(parseRupeesToPaise("79.555")).toBeNull();
    expect(parseRupeesToPaise("0")).toBeNull();
  });
});

describe("formatPoints", () => {
  it("reads a paise balance as whole points — 1 point = ₹1", () => {
    expect(formatPoints(3900)).toBe("39 points");
    expect(formatPoints(11_700)).toBe("117 points");
  });

  it("singularises one point", () => {
    expect(formatPoints(100)).toBe("1 point");
  });

  it("groups large balances Indian-style", () => {
    expect(formatPoints(10_00_000_00)).toBe("10,00,000 points");
  });

  it("shows nothing earned as zero rather than a blank", () => {
    expect(formatPoints(0)).toBe("0 points");
  });
});
