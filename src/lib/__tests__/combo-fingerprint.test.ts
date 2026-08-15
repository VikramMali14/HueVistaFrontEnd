import { describe, it, expect } from "vitest";
import { comboAlreadyOnBoard, comboFingerprint, type ComboPart } from "../combo-fingerprint";

const main = (hex: string): ComboPart => ({ regionId: 1, label: "Main wall", hex });
const trim = (hex: string): ComboPart => ({ regionId: 2, label: "Trim", hex });

describe("comboFingerprint", () => {
  it("matches the same colours on the same regions", () => {
    expect(comboFingerprint([main("#f4efe6"), trim("#4a362a")]))
      .toBe(comboFingerprint([main("#f4efe6"), trim("#4a362a")]));
  });

  it("ignores the order the regions come in", () => {
    expect(comboFingerprint([main("#f4efe6"), trim("#4a362a")]))
      .toBe(comboFingerprint([trim("#4a362a"), main("#f4efe6")]));
  });

  it("ignores hex case", () => {
    expect(comboFingerprint([main("#F4EFE6")])).toBe(comboFingerprint([main("#f4efe6")]));
  });

  it("separates the same colour on different walls", () => {
    expect(comboFingerprint([main("#f4efe6")])).not.toBe(comboFingerprint([trim("#f4efe6")]));
  });

  it("separates a subset from the whole", () => {
    expect(comboFingerprint([main("#f4efe6")]))
      .not.toBe(comboFingerprint([main("#f4efe6"), trim("#4a362a")]));
  });

  it("falls back to the label for a region that has not been saved yet", () => {
    const drawn: ComboPart = { label: "Feature wall", hex: "#c73f8a" };
    expect(comboFingerprint([drawn])).toBe(comboFingerprint([{ label: "feature wall", hex: "#C73F8A" }]));
    expect(comboFingerprint([drawn])).not.toBe(comboFingerprint([{ label: "Soffit", hex: "#c73f8a" }]));
  });
});

describe("comboAlreadyOnBoard", () => {
  const board = [
    [main("#f4efe6"), trim("#4a362a")],
    [main("#b0603e"), trim("#4a362a")],
  ];

  it("points at the page the colours are already on", () => {
    expect(comboAlreadyOnBoard(board, [trim("#4a362a"), main("#b0603e")])).toBe(1);
  });

  it("lets a genuinely different scheme through", () => {
    expect(comboAlreadyOnBoard(board, [main("#f4efe6"), trim("#111111")])).toBe(-1);
  });

  it("lets anything onto an empty board", () => {
    expect(comboAlreadyOnBoard([], [main("#f4efe6")])).toBe(-1);
  });
});
