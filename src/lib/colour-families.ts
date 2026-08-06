/**
 * Parent colour families for the catalogue filter.
 *
 * The filter row was raw brand data, every company's own taxonomy flattened into
 * one list of peers: "Blues", "Blue-greens", "Blue Greens & Greens", "Neutrals",
 * "Classic Neutrals", "Neutrals: Browns & Greys", "Off Whites", "Whispering
 * Whites" and "Whites" all sitting side by side. That is not a taxonomy anyone
 * can filter with — it is three companies' marketing vocabularies in a row, and
 * it made the row long enough to need a sideways scroller.
 *
 * These nine parents are the ones a person actually shops by. The brand's own
 * name is never thrown away: it is shown underneath as a sub-filter, so a
 * retailer who knows "Whispering Whites" can still get exactly that.
 */

export const PARENT_FAMILIES = [
  "Whites",
  "Neutrals",
  "Greys & blacks",
  "Reds & pinks",
  "Oranges & browns",
  "Yellows & golds",
  "Greens",
  "Blues",
  "Purples",
  "Other",
] as const;

export type ParentFamily = (typeof PARENT_FAMILIES)[number];

/**
 * Ordered because family names routinely name two colours ("Blue Greens &
 * Greens", "Neutrals: Browns & Greys"). First match wins, so the order below IS
 * the disambiguation rule — whites before neutrals so "Off Whites" and
 * "Whispering Whites" land under Whites rather than being read as beige, and
 * blues before greens so the blue-green families stay together in one place
 * instead of splitting across two parents.
 */
const RULES: ReadonlyArray<readonly [ParentFamily, RegExp]> = [
  ["Whites", /white/i],
  ["Neutrals", /neutral|beige|taupe|greige|stone|sand|cream|ivory|linen|oatmeal/i],
  ["Greys & blacks", /grey|gray|black|charcoal|slate|graphite/i],
  ["Blues", /blue|teal|aqua|turquoise|cyan|indigo|navy/i],
  ["Greens", /green|olive|lime|mint|moss|sage|fern/i],
  ["Yellows & golds", /yellow|gold|ochre|okhra|mustard|amber|lemon|honey/i],
  ["Oranges & browns", /orange|brown|rust|terracotta|peach|apricot|copper|bronze|\btan\b|chocolate|coffee/i],
  ["Reds & pinks", /\bred|pink|rose|maroon|crimson|magenta|coral|blush|wine|burgundy/i],
  ["Purples", /purple|violet|lilac|lavender|mauve|plum|orchid/i],
];

/** The parent family a brand's own family name belongs to. */
export function parentFamilyOf(family: string): ParentFamily {
  for (const [parent, re] of RULES) {
    if (re.test(family)) return parent;
  }
  return "Other";
}
