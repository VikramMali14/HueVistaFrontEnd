/**
 * SAMPLE competitor shade data for the counter-side "code translator".
 *
 * Like lib/shades.ts (the bundled Asian Paints sample), this is demo data so
 * the tool works offline and before the backend competitor catalogues are
 * seeded. Codes and names here are ILLUSTRATIVE — they follow each brand's
 * code style but are not verified against real fan decks, and every hex is an
 * approximate screen value. The UI labels matches from this list as
 * approximate. Replace via the backend catalogue when Berger/Nerolac land.
 */

export interface CompetitorShade {
  brand: "Berger" | "Nerolac";
  code: string;
  name: string;
  hex: string;
}

export const COMPETITOR_SHADES: ReadonlyArray<CompetitorShade> = [
  // — Berger (sample) —
  { brand: "Berger", code: "BG-7P-0117", name: "Morning Lily", hex: "#f2ede2" },
  { brand: "Berger", code: "BG-7P-0231", name: "Soft Ivory", hex: "#ece4d2" },
  { brand: "Berger", code: "BG-3T-0412", name: "Sand Dune", hex: "#d8c2a0" },
  { brand: "Berger", code: "BG-3T-0525", name: "Honey Glow", hex: "#d2a878" },
  { brand: "Berger", code: "BG-2D-0618", name: "Clay Pot", hex: "#a8744c" },
  { brand: "Berger", code: "BG-2D-0731", name: "Burnt Earth", hex: "#8c5a38" },
  { brand: "Berger", code: "BG-1R-0816", name: "Rust Bloom", hex: "#b46a4a" },
  { brand: "Berger", code: "BG-1R-0922", name: "Deep Maroon", hex: "#7c3a30" },
  { brand: "Berger", code: "BG-5G-1014", name: "Mint Veil", hex: "#aebca8" },
  { brand: "Berger", code: "BG-5G-1126", name: "Fern Shadow", hex: "#76886e" },
  { brand: "Berger", code: "BG-5G-1233", name: "Olive Grove", hex: "#576852" },
  { brand: "Berger", code: "BG-6B-1318", name: "Pigeon Grey", hex: "#8a96a4" },
  { brand: "Berger", code: "BG-6B-1427", name: "Slate Evening", hex: "#42505a" },
  { brand: "Berger", code: "BG-6B-1535", name: "Midnight Indigo", hex: "#384568" },
  { brand: "Berger", code: "BG-4N-1612", name: "Oat Beige", hex: "#cfbb9e" },
  { brand: "Berger", code: "BG-4N-1724", name: "Walnut Husk", hex: "#937257" },
  { brand: "Berger", code: "BG-8K-1816", name: "Charcoal Night", hex: "#2e2a26" },
  { brand: "Berger", code: "BG-9Y-1914", name: "Turmeric", hex: "#d2a045" },
  // — Nerolac (sample) —
  { brand: "Nerolac", code: "NK-2104", name: "Pearl Drop", hex: "#f1ece1" },
  { brand: "Nerolac", code: "NK-2168", name: "Cream Silk", hex: "#eadfc8" },
  { brand: "Nerolac", code: "NK-2231", name: "Wheat Field", hex: "#d9c49e" },
  { brand: "Nerolac", code: "NK-2287", name: "Amber Sand", hex: "#cfa172" },
  { brand: "Nerolac", code: "NK-2342", name: "Terracide", hex: "#a06a44" },
  { brand: "Nerolac", code: "NK-2399", name: "Cocoa Brown", hex: "#7e5a40" },
  { brand: "Nerolac", code: "NK-2451", name: "Brick Lane", hex: "#aa5e42" },
  { brand: "Nerolac", code: "NK-2508", name: "Garnet Red", hex: "#84362c" },
  { brand: "Nerolac", code: "NK-2563", name: "Sage Mist", hex: "#a4b29e" },
  { brand: "Nerolac", code: "NK-2619", name: "Moss Stone", hex: "#6d7e64" },
  { brand: "Nerolac", code: "NK-2674", name: "Steel Blue", hex: "#7e8c9c" },
  { brand: "Nerolac", code: "NK-2730", name: "Harbour Grey", hex: "#4a565e" },
  { brand: "Nerolac", code: "NK-2786", name: "Navy Dusk", hex: "#343f62" },
  { brand: "Nerolac", code: "NK-2841", name: "Almond Shell", hex: "#c8b294" },
  { brand: "Nerolac", code: "NK-2897", name: "Teak Brown", hex: "#85643f" },
  { brand: "Nerolac", code: "NK-2954", name: "Mustard Seed", hex: "#c89a3e" },
];

/** Case/spacing/dash-insensitive code lookup: "bg 7p 0117" finds BG-7P-0117. */
export function findCompetitorShade(query: string): CompetitorShade | undefined {
  const norm = (s: string) => s.toUpperCase().replace(/[\s-]+/g, "");
  const q = norm(query);
  if (!q) return undefined;
  return COMPETITOR_SHADES.find((c) => norm(c.code) === q || norm(c.code).endsWith(q));
}
