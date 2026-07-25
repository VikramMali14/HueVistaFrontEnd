"use client";

import { useEffect, useState } from "react";
import { deltaE, hexToLab, nearestShades } from "@/lib/color";
import { mapToPaintShade } from "@/lib/catalogue";
import type { PaintShade } from "@/lib/types";

export interface ShadeMatch {
  shade: PaintShade;
  deltaE: number;
}

export type MatchSource = "backend" | "offline" | null;

/** One company to restrict matching to: the backend needs the slug, the offline
 *  fallback matches on the display name the catalogue carries. */
export interface MatchBrand {
  name: string;
  slug: string;
}

/**
 * Nearest catalogue shades for a colour — the ONE matching path every tool
 * shares. Asks the backend's full-catalogue matcher (`GET /api/shades/match`,
 * public, same-origin via the Next rewrite) and falls back to the bundled
 * client-side matcher when the backend is unreachable or empty, so the tools
 * keep working with no server.
 *
 * `brand` restricts the search to one paint company. The counter case this
 * serves: a customer wants the closest colour *their shop actually stocks*, so
 * the nearest shade overall (from a company the shop doesn't carry) is the
 * wrong answer. Both paths honour it — the backend via `?brand=<slug>`, the
 * offline matcher by filtering the pool on the company's display name — so the
 * result never silently widens back to every company when the backend is down.
 */
export function useShadeMatch(
  hex: string | null,
  catalogue: ReadonlyArray<PaintShade>,
  limit = 6,
  brand?: MatchBrand | null,
): { matches: ShadeMatch[]; source: MatchSource; loading: boolean } {
  const [matches, setMatches] = useState<ShadeMatch[]>([]);
  const [source, setSource] = useState<MatchSource>(null);
  const [loading, setLoading] = useState(false);

  // Primitives, so a caller passing a fresh object literal each render doesn't
  // restart the effect on every keystroke.
  const brandSlug = brand?.slug ?? "";
  const brandName = brand?.name ?? "";

  useEffect(() => {
    if (!hex) {
      setMatches([]);
      setSource(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fallbackOffline = () => {
      if (cancelled) return;
      const pool = brandName
        ? catalogue.filter((s) => s.brand.toLowerCase() === brandName.toLowerCase())
        : catalogue;
      setMatches(nearestShades(hex, pool, limit));
      setSource("offline");
      setLoading(false);
    };
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/shades/match?hex=${encodeURIComponent(hex)}&limit=${limit}` +
            (brandSlug ? `&brand=${encodeURIComponent(brandSlug)}` : ""),
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        if (!res.ok) return fallbackOffline();
        const data = (await res.json()) as Array<Parameters<typeof mapToPaintShade>[0]>;
        if (cancelled) return;
        // An empty answer for a specific company is a real answer ("that company has
        // nothing in the catalogue"), not a dead backend — falling back to the bundled
        // matcher here would quietly hand back another company's shades.
        if (!Array.isArray(data) || (data.length === 0 && !brandSlug)) return fallbackOffline();
        const pickedLab = hexToLab(hex);
        setMatches(
          data.map((b) => {
            const shade = mapToPaintShade(b);
            return { shade, deltaE: deltaE(pickedLab, hexToLab(shade.hex)) };
          }),
        );
        setSource("backend");
        setLoading(false);
      } catch {
        fallbackOffline();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hex, catalogue, limit, brandSlug, brandName]);

  return { matches, source, loading };
}
