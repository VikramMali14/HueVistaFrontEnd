import type { PaintShade } from "./types";

export const SHADES: ReadonlyArray<PaintShade> = [
  { code: "AP-N101", name: "Bone China", hex: "#f3eee4", family: "Whites", lrv: 88, brand: "Asian Paints", finishes: ["Matt", "Satin", "Royale"] },
  { code: "AP-N105", name: "Ivory Coast", hex: "#ebe5d7", family: "Whites", lrv: 82, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-N110", name: "Linen", hex: "#e7d9c4", family: "Whites", lrv: 76, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-2104", name: "Champagne Wash", hex: "#dac1a3", family: "Neutrals", lrv: 58, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-2112", name: "Saffron Cream", hex: "#d6a78a", family: "Neutrals", lrv: 51, brand: "Asian Paints", finishes: ["Matt", "Satin", "Royale"] },
  { code: "AP-2118", name: "Terracotta", hex: "#a47148", family: "Earths", lrv: 28, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-2121", name: "Tan Bark", hex: "#8a5a3a", family: "Earths", lrv: 22, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-2208", name: "Saffron", hex: "#c9a17a", family: "Yellows", lrv: 49, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-2215", name: "Champagne", hex: "#dac1a3", family: "Neutrals", lrv: 59, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-2230", name: "Cinnamon", hex: "#9b6e4a", family: "Browns", lrv: 27, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-1428", name: "Terracotta Rose", hex: "#b96b48", family: "Reds", lrv: 24, brand: "Asian Paints", finishes: ["Matt", "Satin", "Royale"] },
  { code: "AP-3304", name: "Walnut", hex: "#5a4030", family: "Browns", lrv: 14, brand: "Asian Paints", finishes: ["Matt", "Velvet"] },
  { code: "AP-3318", name: "Oxblood", hex: "#7a3a2f", family: "Reds", lrv: 12, brand: "Asian Paints", finishes: ["Matt", "Royale", "Velvet"] },
  { code: "AP-7706", name: "Sage Whisper", hex: "#7b8a72", family: "Greens", lrv: 26, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-7711", name: "Pale Sage", hex: "#a9b8a4", family: "Greens", lrv: 41, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-7720", name: "Olive Branch", hex: "#5b6c5b", family: "Greens", lrv: 18, brand: "Asian Paints", finishes: ["Matt", "Velvet"] },
  { code: "AP-9904", name: "Slate", hex: "#3e4a52", family: "Blues", lrv: 11, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-9912", name: "Indigo Twilight", hex: "#3a4870", family: "Blues", lrv: 13, brand: "Asian Paints", finishes: ["Matt", "Velvet"] },
  { code: "AP-9921", name: "Storm", hex: "#465259", family: "Greys", lrv: 15, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-9930", name: "Pewter", hex: "#8c98a8", family: "Greys", lrv: 32, brand: "Asian Paints", finishes: ["Matt", "Satin"] },
  { code: "AP-9940", name: "Ash Beige", hex: "#cbb89e", family: "Neutrals", lrv: 56, brand: "Asian Paints", finishes: ["Matt", "Royale"] },
  { code: "AP-N999", name: "Ink", hex: "#1a1612", family: "Greys", lrv: 4, brand: "Asian Paints", finishes: ["Matt", "Velvet"] },
];

export function findShadeByCode(code: string): PaintShade | undefined {
  return SHADES.find((s) => s.code === code);
}
