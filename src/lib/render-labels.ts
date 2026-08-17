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
 */

export const STYLE_LABELS: Record<RenderOptions["style"], string> = {
  MODERN: "Modern",
  MINIMAL: "Minimal",
  TRADITIONAL: "Traditional",
  HERITAGE: "Heritage",
  LUXE: "Luxe",
};

export const TIME_OF_DAY_LABELS: Record<RenderOptions["timeOfDay"], string> = {
  DAY: "Day",
  NIGHT: "Night",
};

export const LIGHTING_LABELS: Record<RenderOptions["lighting"], string> = {
  NATURAL: "Natural",
  WARM: "Warm",
  COOL: "Cool",
  DRAMATIC: "Dramatic",
};

export const FURNISHING_LABELS: Record<RenderOptions["furnishing"], string> = {
  KEEP: "As it is",
  STAGED: "Styled",
  EMPTY: "Empty",
};

export const BORDER_LABELS: Record<RenderOptions["borderMode"], string> = {
  KEEP_ORIGINAL: "Keep my borders",
  AI_SUGGESTED: "Suggest borders",
};

/** The three qualities, as a person says them. */
export const QUALITY_LABELS: Record<RenderQuality, string> = {
  BASIC: "Basic",
  PRO: "Pro",
  MAX: "Max",
};

/**
 * "Modern · Day · Natural light · Max" — how one image was photographed, in one line.
 *
 * The quality is on the end because two pictures of the same room in the same scheme can
 * now differ by nothing else, and a shelf of them with identical captions is a shelf
 * nobody can choose from. BASIC is left off: it is the ordinary picture, and labelling the
 * default is noise on every caption in order to be useful on a few.
 *
 * Falls back to the raw enum value rather than to an empty string when a server sends
 * something this build has not heard of. A caption reading "TWILIGHT" is odd; a caption
 * reading "Modern ·  · Natural light" looks like a bug in the document.
 */
export function describeRender(
  render: Pick<RenderOptions, "style" | "timeOfDay" | "lighting"> & { quality?: RenderQuality },
): string {
  const look = STYLE_LABELS[render.style] ?? render.style;
  const when = TIME_OF_DAY_LABELS[render.timeOfDay] ?? render.timeOfDay;
  const light = LIGHTING_LABELS[render.lighting] ?? render.lighting;
  const line = `${look} · ${when} · ${light} light`;
  if (!render.quality || render.quality === "BASIC") return line;
  return `${line} · ${QUALITY_LABELS[render.quality] ?? render.quality}`;
}
