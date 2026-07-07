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

/**
 * Nearest catalogue shades for a colour — the ONE matching path every tool
 * shares. Asks the backend's full-catalogue matcher (`GET /api/shades/match`,
 * public, same-origin via the Next rewrite) and falls back to the bundled
 * client-side matcher when the backend is unreachable or empty, so the tools
 * keep working with no server.
 */
export function useShadeMatch(
  hex: string | null,
  catalogue: ReadonlyArray<PaintShade>,
  limit = 6,
): { matches: ShadeMatch[]; source: MatchSource; loading: boolean } {
  const [matches, setMatches] = useState<ShadeMatch[]>([]);
  const [source, setSource] = useState<MatchSource>(null);
  const [loading, setLoading] = useState(false);

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
      setMatches(nearestShades(hex, catalogue, limit));
      setSource("offline");
      setLoading(false);
    };
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/shades/match?hex=${encodeURIComponent(hex)}&limit=${limit}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        if (!res.ok) return fallbackOffline();
        const data = (await res.json()) as Array<Parameters<typeof mapToPaintShade>[0]>;
        if (cancelled) return;
        if (!Array.isArray(data) || data.length === 0) return fallbackOffline();
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
  }, [hex, catalogue, limit]);

  return { matches, source, loading };
}
