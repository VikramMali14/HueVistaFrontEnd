import { config } from "./config";
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

const ALLOWED_FINISHES = ["Matt", "Satin", "Royale", "Velvet"] as const;
type Finish = (typeof ALLOWED_FINISHES)[number];

function normalizeFamily(raw: string | null | undefined): ColorFamily {
  const f = (raw ?? "").toLowerCase();
  if (f.includes("white")) return "Whites";
  if (f.includes("blue")) return "Blues";
  if (f.includes("green")) return "Greens";
  if (f.includes("red")) return "Reds";
  if (f.includes("yellow") || f.includes("gold")) return "Yellows";
  if (f.includes("grey") || f.includes("gray")) return "Greys";
  if (f.includes("brown") || f.includes("wood")) return "Browns";
  if (f.includes("earth") || f.includes("terracotta") || f.includes("tan") || f.includes("ochre")) return "Earths";
  return "Neutrals";
}

function normalizeBrand(raw: string | null | undefined): PaintShade["brand"] {
  const b = (raw ?? "").toLowerCase();
  if (b.includes("berger")) return "Berger";
  if (b.includes("nerolac")) return "Nerolac";
  if (b.includes("dulux")) return "Dulux";
  return "Asian Paints";
}

function normalizeFinishes(raw: string[] | null | undefined): Finish[] {
  const picked = (raw ?? [])
    .map((x) => ALLOWED_FINISHES.find((a) => a.toLowerCase() === String(x).toLowerCase()))
    .filter((x): x is Finish => Boolean(x));
  return picked.length > 0 ? picked : ["Matt"];
}

function normalizeHex(raw: string | null | undefined): string {
  const h = (raw ?? "").trim();
  if (!h) return "#cccccc";
  return h.startsWith("#") ? h : `#${h}`;
}

export function mapToPaintShade(b: BackendShade): PaintShade {
  const lrvNum = typeof b.lrv === "number" ? b.lrv : Number(b.lrv);
  return {
    code: b.shadeCode ?? "—",
    name: b.name ?? "Unnamed",
    hex: normalizeHex(b.hexCode),
    family: normalizeFamily(b.shadeFamily),
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
  const res = await fetch(`${config.internalApiOrigin}/api/shades`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 }, // catalogue changes rarely
  });
  if (!res.ok) throw new Error(`catalogue fetch failed: ${res.status}`);
  const data = (await res.json()) as BackendShade[];
  return data.map(mapToPaintShade);
}
