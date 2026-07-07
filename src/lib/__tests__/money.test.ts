import { describe, it, expect } from "vitest";
import {
  MIN_REDEMPTION_PAISE,
  STORE_MIN_PRICE_PAISE,
  formatRupees,
  parseRupeesToPaise,
  validateStorePrice,
} from "../money";

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

describe("validateStorePrice", () => {
  it("accepts the minimum price exactly", () => {
    expect(validateStorePrice("50")).toBeNull();
    expect(STORE_MIN_PRICE_PAISE).toBe(5000);
  });

  it("accepts the suggested ₹79", () => {
    expect(validateStorePrice("79")).toBeNull();
  });

  it("rejects prices under the ₹50 platform base", () => {
    expect(validateStorePrice("49.99")).toMatch(/minimum price/i);
    expect(validateStorePrice("10")).toMatch(/minimum price/i);
  });

  it("rejects unparseable input with a usage hint", () => {
    expect(validateStorePrice("free")).toMatch(/rupees/i);
  });
});

describe("MIN_REDEMPTION_PAISE", () => {
  it("matches the backend default (₹50)", () => {
    expect(MIN_REDEMPTION_PAISE).toBe(5000);
  });
});
