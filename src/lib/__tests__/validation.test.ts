import { describe, it, expect } from "vitest";
import {
  ACCESS_CODE_ERROR_MESSAGE,
  EMAIL_ERROR_MESSAGE,
  PHONE_ERROR_MESSAGE,
  normalizeAccessCode,
  validateAccessCode,
  validateEmail,
  validatePhone,
} from "../validation";

describe("validatePhone", () => {
  it("accepts a plain 10-digit mobile", () => {
    expect(validatePhone("9876543210")).toBeNull();
  });

  it("accepts +91 with spaces", () => {
    expect(validatePhone("+91 98765 43210")).toBeNull();
  });

  it("accepts a hyphenated number", () => {
    expect(validatePhone("98765-43210")).toBeNull();
  });

  it("accepts parentheses around the country code", () => {
    expect(validatePhone("(+91) 98765-43210")).toBeNull();
  });

  it("rejects letters", () => {
    expect(validatePhone("98765abcde")).toBe(PHONE_ERROR_MESSAGE);
  });

  it("rejects too-short numbers", () => {
    expect(validatePhone("12345")).toBe(PHONE_ERROR_MESSAGE);
  });

  it("rejects an empty value", () => {
    expect(validatePhone("")).toBe(PHONE_ERROR_MESSAGE);
    expect(validatePhone("   ")).toBe(PHONE_ERROR_MESSAGE);
  });

  it("accepts a 0-prefixed domestic number", () => {
    expect(validatePhone("098765 43210")).toBeNull();
  });

  it("accepts a country code typed without the +", () => {
    expect(validatePhone("919876543210")).toBeNull();
  });

  it("rejects a bare 11-digit number that is neither 0-prefixed nor country-coded", () => {
    expect(validatePhone("98765432109")).toBe(PHONE_ERROR_MESSAGE);
  });

  it("rejects a + in the middle of the number", () => {
    expect(validatePhone("98+7654321")).toBe(PHONE_ERROR_MESSAGE);
  });

  it("rejects numbers longer than a country-coded mobile", () => {
    expect(validatePhone("+9198765432101234")).toBe(PHONE_ERROR_MESSAGE);
  });
});

describe("validateEmail", () => {
  it("accepts a normal address", () => {
    expect(validateEmail("priya@mehtapaints.in")).toBeNull();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateEmail("  priya@mehtapaints.in  ")).toBeNull();
  });

  it("rejects a missing @", () => {
    expect(validateEmail("priya.mehtapaints.in")).toBe(EMAIL_ERROR_MESSAGE);
  });

  it("rejects a domain without a dot", () => {
    expect(validateEmail("priya@mehtapaints")).toBe(EMAIL_ERROR_MESSAGE);
  });

  it("rejects internal spaces", () => {
    expect(validateEmail("priya mehta@paints.in")).toBe(EMAIL_ERROR_MESSAGE);
  });

  it("rejects an empty value", () => {
    expect(validateEmail("")).toBe(EMAIL_ERROR_MESSAGE);
  });
});

describe("normalizeAccessCode / validateAccessCode", () => {
  it("normalizes by trimming and uppercasing", () => {
    expect(normalizeAccessCode("  7k2nq9px ")).toBe("7K2NQ9PX");
  });

  it("accepts 8 alphanumeric characters", () => {
    expect(validateAccessCode("7K2NQ9PX")).toBeNull();
  });

  it("accepts lowercase / padded input (normalized internally)", () => {
    expect(validateAccessCode("  7k2nq9px ")).toBeNull();
  });

  it("rejects 7 characters", () => {
    expect(validateAccessCode("7K2NQ9P")).toBe(ACCESS_CODE_ERROR_MESSAGE);
  });

  it("rejects 9 characters", () => {
    expect(validateAccessCode("7K2NQ9PXZ")).toBe(ACCESS_CODE_ERROR_MESSAGE);
  });

  it("rejects symbols", () => {
    expect(validateAccessCode("7K2NQ9P!")).toBe(ACCESS_CODE_ERROR_MESSAGE);
    expect(validateAccessCode("7K2-Q9PX")).toBe(ACCESS_CODE_ERROR_MESSAGE);
  });

  it("rejects an empty value", () => {
    expect(validateAccessCode("")).toBe(ACCESS_CODE_ERROR_MESSAGE);
  });
});
