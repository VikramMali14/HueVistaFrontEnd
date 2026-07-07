import { hexToLab } from "./color";
import { chroma, labHue } from "./color-science";
import { config } from "./config";
import { isDemoMode } from "./demo/flag";
import { SHADES } from "./shades";
import type { ColorFamily, PaintShade } from "./types";

/** Subset of the backend ShadeResponse the catalogue uses. */
interface BackendShade {
  shadeCode?: string;
  name?: string;
  hexCode?: string;
  shadeFamily?: string | null;
  brandName?: string | null;
  lrv?: number | string | null;
  finishRecommendations?: string[] | null;
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Family filters are built from whatever the shades table actually holds, so a
 * shade keeps its brand's own family name (tidied to title case) — "off whites"
 * stays "Off Whites" rather than being squashed into a fixed bucket. Only a
 * shade with no family at all gets one derived from its colour, so it still
 * lands under a sensible filter pill.
 */
function normalizeFamily(raw: string | null | undefined, hex: string): string {
  const t = (raw ?? "").trim();
  return t.length > 0 ? titleCase(t) : familyFromColor(hex);
}

/** Canonical family for a colour, from CIELAB lightness / chroma / hue bands. */
function familyFromColor(hex: string): ColorFamily {
  const lab = hexToLab(hex);
  const c = chroma(lab);
  if (lab.L >= 85 && c < 12) return "Whites";
  if (c < 6) return "Greys";
  if (c < 12) return "Neutrals";
  const h = labHue(lab);
  if (h < 45) return "Reds";
  if (h < 75) return lab.L < 45 ? "Browns" : "Earths";
  if (h < 115) return "Yellows";
  if (h < 180) return "Greens";
  if (h < 315) return "Blues";
  return "Reds";
}

/**
 * Keep whatever company name the backend sent — the catalogue is multi-brand and
 * new companies arrive via the admin shade upload, so there is no fixed list to
 * normalise against. Only a missing name falls back to "Asian Paints".
 */
function normalizeBrand(raw: string | null | undefined): PaintShade["brand"] {
  const b = (raw ?? "").trim();
  return b.length > 0 ? b : "Asian Paints";
}

/** Common spellings mapped to the display name the Indian market uses. */
const FINISH_ALIASES: Record<string, string> = { matte: "Matt" };

/**
 * Keep whatever finishes the shades table recommends (tidied + deduped) — the
 * finish filter is built from these, so nothing is squashed into a fixed list.
 * No data means no finishes; we don't invent a default.
 */
function normalizeFinishes(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw ?? []) {
    const t = String(r).trim();
    if (!t) continue;
    const label = FINISH_ALIASES[t.toLowerCase()] ?? titleCase(t);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function normalizeHex(raw: string | null | undefined): string {
  const h = (raw ?? "").trim();
  if (!h) return "#cccccc";
  return h.startsWith("#") ? h : `#${h}`;
}

export function mapToPaintShade(b: BackendShade): PaintShade {
  const lrvNum = typeof b.lrv === "number" ? b.lrv : Number(b.lrv);
  const hex = normalizeHex(b.hexCode);
  return {
    code: b.shadeCode ?? "—",
    name: b.name ?? "Unnamed",
    hex,
    family: normalizeFamily(b.shadeFamily, hex),
    lrv: Number.isFinite(lrvNum) ? Math.round(lrvNum) : 50,
    brand: normalizeBrand(b.brandName),
    finishes: normalizeFinishes(b.finishRecommendations),
  };
}

/**
 * Fetch the live catalogue from the backend (server-side, public endpoint). Throws on
 * failure so the caller can fall back to the bundled sample shades.
 */
export async function fetchCatalogue(): Promise<PaintShade[]> {
  // DEMO_MODE: no backend — serve the bundled catalogue directly (avoids a slow
  // failed fetch to a dead origin). Studio + colour finder render the full set.
  if (isDemoMode()) return [...SHADES];
  const res = await fetch(`${config.internalApiOrigin}/api/shades`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 }, // catalogue changes rarely
  });
  if (!res.ok) throw new Error(`catalogue fetch failed: ${res.status}`);
  const data = (await res.json()) as BackendShade[];
  return data.map(mapToPaintShade);
}

/**
 * The live catalogue, falling back to the bundled sample when the backend is
 * unreachable or empty — the standard way every page loads its shades.
 */
export async function getCatalogueOrSample(): Promise<PaintShade[]> {
  try {
    const live = await fetchCatalogue();
    return live.length > 0 ? live : [...SHADES];
  } catch {
    return [...SHADES];
  }
}
