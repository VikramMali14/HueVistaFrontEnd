import { deltaE, hexToLab } from "./color";
import type { PaintShade } from "./types";

/**
 * "The customer has a code from a company we don't sell — what do WE make that is
 * this colour?"
 *
 * A room gets designed against whatever company was to hand: a printed Asian Paints
 * card, a shade someone's builder named, a code off a friend's board. The shop the
 * customer then walks into carries something else. Until now the studio's search
 * answered that with "No shades match", because it only ever looked at the shades on
 * screen — which is to say, at the one company the customer does NOT have a code for.
 *
 * This resolves the typed code against the WHOLE catalogue the caller may see, then
 * reports the nearest colour in each company that IS on screen. So typing an Asian
 * Paints L124 while showing HueVista answers "H101 — the same colour", which is the
 * only form of the answer anyone can act on at a counter.
 *
 * The catalogue is already in the browser (the studio is handed every shade the caller
 * may work with), so this is a pure function over arrays: no request, no endpoint, and
 * it works for a guest and a customer, neither of whom may call /api/shades/decode.
 */

/** ΔE below which two colours are the same paint, not a near miss. Mirrors the backend's decoder. */
const EXACT_EPSILON = 0.05;

/** Codes are short; one or two characters would match half the catalogue by accident. */
const MIN_CODE_LENGTH = 2;

/** Companies to answer with. Past a handful the band is longer than the grid it sits above. */
const DEFAULT_MAX_COMPANIES = 6;

export interface CrossBrandMatch {
  shade: PaintShade;
  /** CIE76 ΔE from the typed colour. 0 when this company carries the very colour. */
  deltaE: number;
  /** True only when it IS the colour, not the closest one — never blur these two. */
  exact: boolean;
}

export interface CrossBrandResult {
  /** The code as it was read, normalised — so the band can echo back what was typed. */
  query: string;
  /** The shade the code names. */
  source: PaintShade;
  /** True when the typed code was a HueVista code rather than a manufacturer's own. */
  viaHvCode: boolean;
  /** Nearest in each other company on screen, closest first. Never empty. */
  matches: ReadonlyArray<CrossBrandMatch>;
}

/**
 * Several companies carry the typed code, so it names no single colour.
 *
 * Deliberately a question rather than a guess: manufacturer codes are only unique
 * within a company, and picking one would name a real shade from the wrong company —
 * which reads exactly like a correct answer and is the worst mistake this can make.
 */
export interface CrossBrandAmbiguity {
  query: string;
  /** One shade per company that carries this code, for the user to choose between. */
  candidates: ReadonlyArray<PaintShade>;
}

export type CrossBrandLookup =
  | ({ kind: "match" } & CrossBrandResult)
  | ({ kind: "ambiguous" } & CrossBrandAmbiguity);

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Rough hex guard — a shade with no usable colour can't be measured against anything. */
const usableHex = (hex: string | null | undefined): hex is string =>
  typeof hex === "string" && /^#?[0-9a-fA-F]{6}$/.test(hex.trim());

/**
 * Find the colour behind `query` in `all`, and the nearest shade to it in each company
 * present in `shown`.
 *
 * `shown` is what the panel is currently displaying (the company picker's scope) and
 * `all` is everything the caller may see. The source is looked up in `all` precisely
 * because the interesting case is a code for a company that has been scoped OUT.
 *
 * Returns null when the query is not an exact code, or when there is no other company
 * on screen to answer with — in both cases the grid underneath is already the answer.
 */
export function crossBrandLookup(
  query: string,
  shown: ReadonlyArray<PaintShade>,
  all: ReadonlyArray<PaintShade>,
  { maxCompanies = DEFAULT_MAX_COMPANIES }: { maxCompanies?: number } = {},
): CrossBrandLookup | null {
  const code = norm(query);
  if (code.length < MIN_CODE_LENGTH) return null;

  // A HueVista code first, because that is what a customer's own board carries, and it
  // is unique across the whole catalogue so it can never be ambiguous. Only if it is
  // not one do we read the input as a manufacturer's own code — the user types both
  // into the same box and should not have to know which kind they are holding.
  const byHv = all.find((s) => norm(s.hvCode) === code);
  const hits = byHv ? [byHv] : all.filter((s) => norm(s.code) === code);
  if (hits.length === 0) return null;

  if (!byHv && hits.length > 1) {
    // One entry per company: the same company listing a code twice is a catalogue
    // duplicate, not a question worth asking.
    const perCompany = new Map<string, PaintShade>();
    for (const s of hits) if (!perCompany.has(s.brand)) perCompany.set(s.brand, s);
    if (perCompany.size > 1) {
      return {
        kind: "ambiguous",
        query: code,
        candidates: Array.from(perCompany.values()).sort((a, b) => a.brand.localeCompare(b.brand)),
      };
    }
  }

  const source = hits[0]!;
  const matches = nearestPerCompany(source, shown, maxCompanies);
  // Nothing to add: the only company on screen is the one the code came from, and its
  // own swatch is already in the grid below.
  if (matches.length === 0) return null;

  return { kind: "match", query: code, source, viaHvCode: Boolean(byHv), matches };
}

/**
 * The closest shade to `source` in each company in `pool`, closest first.
 *
 * One per company rather than a flat "five nearest", because five nearest is routinely
 * five shades from the same range — which answers "what else is like this" when the
 * question was "what does each company I stock make that is like this".
 *
 * The source's OWN company is dropped only when this pool carries the very shade: its
 * swatch is then already in the grid below, and listing a colour as an alternative to
 * itself is noise. A pool that stocks the company but not that shade keeps it — "the
 * nearest Asian Paints we actually have" is the best answer available, not a
 * disqualified one.
 */
export function nearestPerCompany(
  source: PaintShade,
  pool: ReadonlyArray<PaintShade>,
  maxCompanies = DEFAULT_MAX_COMPANIES,
): ReadonlyArray<CrossBrandMatch> {
  if (!usableHex(source.hex)) return [];
  const target = hexToLab(source.hex);
  const sourceCode = norm(source.code);
  const carriesSource = pool.some((s) => s.brand === source.brand && norm(s.code) === sourceCode);
  const best = new Map<string, { shade: PaintShade; deltaE: number }>();
  for (const s of pool) {
    if (carriesSource && s.brand === source.brand) continue;
    if (!usableHex(s.hex)) continue;
    const d = deltaE(target, hexToLab(s.hex));
    const current = best.get(s.brand);
    if (!current || d < current.deltaE) best.set(s.brand, { shade: s, deltaE: d });
  }
  return Array.from(best.values())
    .sort((a, b) => a.deltaE - b.deltaE || a.shade.brand.localeCompare(b.shade.brand))
    .slice(0, Math.max(1, maxCompanies))
    .map(({ shade, deltaE: d }) => {
      const exact = d <= EXACT_EPSILON;
      return {
        shade,
        // A true zero rather than a rounded-to-zero: "the same colour" printed beside
        // "ΔE 0.04" would look like the label was lying.
        deltaE: exact ? 0 : Math.round(d * 100) / 100,
        exact,
      };
    });
}
