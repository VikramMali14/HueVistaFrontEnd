"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchBrand } from "@/hooks/use-shade-match";
import type { PaintShade, ShadeBrandSummary } from "@/lib/types";

/** The backend's own brand-slug convention (see BrandCatalogImporter): lower case,
 *  every run of non-alphanumerics collapsed to a single dash. */
export function brandSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * The paint companies a colour can be matched against, for the finders' company
 * filter. Reads the live list from the public catalogue endpoint (same-origin
 * rewrite, no auth — these tools run signed-out too) and falls back to the
 * companies present in whatever catalogue the page was handed, so the filter
 * still works offline / in demo mode.
 *
 * Companies with no shades are never offered: filtering to one would leave the
 * customer staring at an empty result list.
 */
export function useShadeBrands(catalogue: ReadonlyArray<PaintShade>): MatchBrand[] {
  const [live, setLive] = useState<MatchBrand[] | null>(null);

  // Fallback derived from the shades the page already has.
  const fromCatalogue = useMemo(() => {
    const names = [...new Set(catalogue.map((s) => s.brand).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    return names.map((name) => ({ name, slug: brandSlug(name) }));
  }, [catalogue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/shades/brands", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ShadeBrandSummary[];
        if (cancelled || !Array.isArray(data)) return;
        const brands = data
          .filter((b) => b.name && b.slug && b.shadeCount > 0)
          .map((b) => ({ name: b.name, slug: b.slug }));
        if (brands.length > 0) setLive(brands);
      } catch {
        /* keep the catalogue-derived fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return live ?? fromCatalogue;
}
