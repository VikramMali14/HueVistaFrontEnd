import type { PaintShade } from "./types";

/**
 * The bundled SAMPLE catalogue — the last-resort fallback when the live one can't be
 * reached, and the demo-mode data set.
 *
 * Every entry here is invented. It used to be invented and labelled "Asian Paints",
 * with codes in that company's format ("AP-1428"), names it does not use, and finish
 * names lifted from its real product lines. Nothing in the list matched anything a
 * customer could buy, so a shop reading a code off this screen would have ordered a
 * shade that does not exist — and a real company's range was being described,
 * publicly and wrongly, by us.
 *
 * So the sample says what it is. The company is "Sample palette", the codes carry an
 * HV- prefix that belongs to no paint manufacturer, and the finishes are the generic
 * ones every company shares. Real shades — real codes, real names, real companies —
 * come from the live catalogue, loaded from those companies' own published data.
 *
 * If you add to this list, keep it that way: no real company name, and no code that
 * could be mistaken for one.
 */
export const SHADES: ReadonlyArray<PaintShade> = [
  { code: "HV-N101", name: "Bone China", hex: "#f3eee4", family: "Whites", lrv: 88, brand: "Sample palette", finishes: ["Matt", "Satin", "Soft sheen"] },
  { code: "HV-N105", name: "Ivory Coast", hex: "#ebe5d7", family: "Whites", lrv: 82, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-N110", name: "Linen", hex: "#e7d9c4", family: "Whites", lrv: 76, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-2104", name: "Champagne Wash", hex: "#dac1a3", family: "Neutrals", lrv: 58, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-2112", name: "Saffron Cream", hex: "#d6a78a", family: "Neutrals", lrv: 51, brand: "Sample palette", finishes: ["Matt", "Satin", "Soft sheen"] },
  { code: "HV-2118", name: "Terracotta", hex: "#a47148", family: "Earths", lrv: 28, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-2121", name: "Tan Bark", hex: "#8a5a3a", family: "Earths", lrv: 22, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-2208", name: "Saffron", hex: "#c9a17a", family: "Yellows", lrv: 49, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-2215", name: "Champagne", hex: "#dac1a3", family: "Neutrals", lrv: 59, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-2230", name: "Cinnamon", hex: "#9b6e4a", family: "Browns", lrv: 27, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-1428", name: "Terracotta Rose", hex: "#b96b48", family: "Reds", lrv: 24, brand: "Sample palette", finishes: ["Matt", "Satin", "Soft sheen"] },
  { code: "HV-3304", name: "Walnut", hex: "#5a4030", family: "Browns", lrv: 14, brand: "Sample palette", finishes: ["Matt", "Textured"] },
  { code: "HV-3318", name: "Oxblood", hex: "#7a3a2f", family: "Reds", lrv: 12, brand: "Sample palette", finishes: ["Matt", "Soft sheen", "Textured"] },
  { code: "HV-7706", name: "Sage Whisper", hex: "#7b8a72", family: "Greens", lrv: 26, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-7711", name: "Pale Sage", hex: "#a9b8a4", family: "Greens", lrv: 41, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-7720", name: "Olive Branch", hex: "#5b6c5b", family: "Greens", lrv: 18, brand: "Sample palette", finishes: ["Matt", "Textured"] },
  { code: "HV-9904", name: "Slate", hex: "#3e4a52", family: "Blues", lrv: 11, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-9912", name: "Indigo Twilight", hex: "#3a4870", family: "Blues", lrv: 13, brand: "Sample palette", finishes: ["Matt", "Textured"] },
  { code: "HV-9921", name: "Storm", hex: "#465259", family: "Greys", lrv: 15, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-9930", name: "Pewter", hex: "#8c98a8", family: "Greys", lrv: 32, brand: "Sample palette", finishes: ["Matt", "Satin"] },
  { code: "HV-9940", name: "Ash Beige", hex: "#cbb89e", family: "Neutrals", lrv: 56, brand: "Sample palette", finishes: ["Matt", "Soft sheen"] },
  { code: "HV-N999", name: "Ink", hex: "#1a1612", family: "Greys", lrv: 4, brand: "Sample palette", finishes: ["Matt", "Textured"] },
];

export function findShadeByCode(code: string): PaintShade | undefined {
  return SHADES.find((s) => s.code === code);
}
