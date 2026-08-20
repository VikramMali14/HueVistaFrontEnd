import type { RenderOptions, RenderQuality } from "./types";

/**
 * How an AI image's options are written down for a human.
 *
 * These live apart from the render studio because two screens now say the same sentence
 * about the same picture: the studio, on the page that made it, and the /ai-images shelf,
 * where it is found again later — and both print it onto the PDF. When the labels lived
 * only in the studio the shelf had to either import a client component to read them or
 * keep a second copy, and a second copy of "MODERN → Modern" is a copy that will one day
 * say "Contemporary" on one page and "Modern" on the other, on documents a customer holds
 * side by side.
 *
 * <p>The studio keeps its own choice tables — it needs a hint line under each button,
 * which is prose about choosing rather than about the result — but it takes its labels
 * from here, so there is exactly one place a name is decided.
 *
 * <p><b>Who is reading these.</b> Somebody standing in a paint shop deciding how ₹99 of
 * their money gets spent, often on a phone, often not in their first language. The names
 * were written for a design magazine — Luxe, Heritage, Minimal, Dramatic, Premium — and
 * every one of them asks the reader to already know what it means. "Luxe" is not a word
 * most people have met; "Heritage" and "Traditional" are near-synonyms to anybody who has
 * not been taught the difference; "Premium" and "Luxury" both mean "expensive" and give
 * no clue which is the expensive one. A choice you cannot read is a choice you make at
 * random, and this is the screen where a random choice costs money.
 *
 * <p>So the names are the shortest ordinary words that separate the options: they say what
 * you GET, not what the option is called in a catalogue. Where two options are a ladder
 * (quality) the words are a ladder too — "Good" and "Best", not two synonyms for costly.
 *
 * <p>The stored enum values are untouched. Only what a person reads changes, which means
 * old images re-caption themselves and the model is asked for exactly what it always was.
 */

/**
 * The look of the finished room.
 *
 * "Plain" for MINIMAL and "Old style" for HERITAGE do the most work here: they are the two
 * a reader was most likely to skip past. TRADITIONAL keeps its name because it is the one
 * word in the set that everybody already uses — but its hint now says how it differs from
 * "Old style", which nothing did before.
 */
export const STYLE_LABELS: Record<RenderOptions["style"], string> = {
  MODERN: "Modern",
  MINIMAL: "Plain",
  TRADITIONAL: "Traditional",
  HERITAGE: "Old style",
  LUXE: "Rich",
};

export const TIME_OF_DAY_LABELS: Record<RenderOptions["timeOfDay"], string> = {
  DAY: "Daytime",
  NIGHT: "Night",
};

/**
 * Read as "<label> light" wherever a picture is described, so every one of these has to
 * still be a sentence with that word after it. "Strong light" is what DRAMATIC actually
 * produces, and is a word somebody can picture without being told.
 */
export const LIGHTING_LABELS: Record<RenderOptions["lighting"], string> = {
  NATURAL: "Normal",
  WARM: "Warm",
  COOL: "Cool",
  DRAMATIC: "Strong",
};

export const FURNISHING_LABELS: Record<RenderOptions["furnishing"], string> = {
  KEEP: "Keep as it is",
  STAGED: "New furniture",
  EMPTY: "Empty room",
};

export const BORDER_LABELS: Record<RenderOptions["borderMode"], string> = {
  KEEP_ORIGINAL: "Same as I marked",
  AI_SUGGESTED: "Let AI decide",
};

/**
 * The two qualities, as a ladder rather than as two words for "expensive".
 *
 * "Premium" and "Luxury" were the old pair, and side by side they told a reader nothing:
 * both mean costly, neither says which is costlier, and the cheaper of the two was named
 * with a word normally used to mean "the upgrade". "Good" and "Best" cannot be read in
 * the wrong order.
 */
export const QUALITY_LABELS: Record<RenderQuality, string> = {
  PREMIUM: "Good",
  LUXURY: "Best",
};

/**
 * "Modern · Daytime · Normal light · Best" — how one image was photographed, in one line.
 *
 * The quality is on the end because two pictures of the same room in the same scheme can
 * now differ by nothing else, and a shelf of them with identical captions is a shelf
 * nobody can choose from. PREMIUM is left off: it is the ordinary picture, and labelling
 * the default is noise on every caption in order to be useful on a few.
 *
 * Falls back to the raw enum value rather than to an empty string when a server sends
 * something this build has not heard of. A caption reading "TWILIGHT" is odd; a caption
 * reading "Modern ·  · Normal light" looks like a bug in the document.
 */
export function describeRender(
  render: Pick<RenderOptions, "style" | "timeOfDay" | "lighting"> & { quality?: RenderQuality },
): string {
  const look = STYLE_LABELS[render.style] ?? render.style;
  const when = TIME_OF_DAY_LABELS[render.timeOfDay] ?? render.timeOfDay;
  const light = LIGHTING_LABELS[render.lighting] ?? render.lighting;
  const line = `${look} · ${when} · ${light} light`;
  if (!render.quality || render.quality === "PREMIUM") return line;
  return `${line} · ${QUALITY_LABELS[render.quality] ?? render.quality}`;
}
