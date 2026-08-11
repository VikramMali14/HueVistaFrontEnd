import { cookies } from "next/headers";
import { config } from "./config";
import { isDemoMode } from "./demo/flag";
import { SHADES } from "./shades";
import { mapToPaintShade, type BackendShade } from "./shade-mapping";
import type { PaintShade } from "./types";

// SERVER-ONLY. This module reads the session cookie to serve each shop its own
// catalogue, so it must not be imported from a client component. The pure
// row → PaintShade mapping lives in ./shade-mapping, which client code uses.

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

/** How big the public catalogue actually is, right now. */
export interface CatalogueSize {
  /** Total shades across every company we have loaded. */
  shades: number;
  /** How many paint companies those shades come from. */
  brands: number;
  /** Those companies, by name, in catalogue order — for prose that lists them. */
  names: string[];
}

/**
 * The size of the public catalogue, straight from the backend.
 *
 * The marketing pages used to hard-code this ("10,000+ shades across five brands")
 * and the number drifted a long way from the truth — the catalogue actually holds
 * 4,522 shades from two companies, and the pricing FAQ named four catalogues that
 * were never loaded. Reading the real figure means the claim can only ever be as
 * generous as the catalogue really is.
 *
 * Uses the cheap `/api/shades/brands` projection (a few hundred bytes) rather than
 * the full 1.2 MB `/api/shades`, and shares the hour-long cache with its sibling
 * above. Returns null when the backend can't be reached, so a caller can render
 * prose that names no number at all rather than a wrong one.
 */
export async function fetchCatalogueSize(): Promise<CatalogueSize | null> {
  try {
    if (isDemoMode()) {
      const brands = Array.from(new Set(SHADES.map((s) => s.brand))).filter(Boolean);
      return { shades: SHADES.length, brands: brands.length, names: brands };
    }
    const res = await fetch(`${config.internalApiOrigin}/api/shades/brands`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ name?: string; shadeCount?: number }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const shades = rows.reduce((n, r) => n + (r.shadeCount ?? 0), 0);
    if (shades <= 0) return null;
    const names = rows.map((r) => r.name).filter((n): n is string => Boolean(n));
    return { shades, brands: rows.length, names };
  } catch {
    return null;
  }
}

/**
 * The catalogue as the caller is allowed to see it — a shop gets only the paint
 * companies its distributor assigned it, and a customer or guest only the ones their
 * shop unlocked on the access code they redeemed.
 *
 * Deliberately NOT cached: the response varies per caller, so a shared `revalidate`
 * entry would hand one shop's restricted catalogue to the next. The public
 * `fetchCatalogue` above keeps its hour-long cache precisely because it is the same
 * for everyone.
 *
 * Throws like its public sibling so the caller can fall back.
 */
async function fetchMyCatalogue(accessToken: string): Promise<PaintShade[]> {
  const res = await fetch(`${config.internalApiOrigin}/api/shades/mine`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`catalogue fetch failed: ${res.status}`);
  const data = (await res.json()) as BackendShade[];
  return data.map(mapToPaintShade);
}

/**
 * The live catalogue, falling back to the bundled sample when the backend is
 * unreachable or empty — the standard way every page loads its shades.
 *
 * When there's a session this asks for the caller's OWN catalogue, so a shop set up
 * for one paint company never sees a shade it can't sell. Signed-out visitors (and
 * every non-retailer) get the full public catalogue, unchanged.
 *
 * Neither fallback applies to a signed-in caller — not the empty result, and not a
 * failed lookup either. "No shades" is a legitimate answer for a restricted shop (a
 * distributor may have granted it nothing yet), and a failure is not a verdict about
 * what the shop may see, but in both cases substituting a catalogue would show
 * companies it was explicitly not given. The bundled sample is worse still: its
 * company is literally called "Sample palette" and its codes buy nothing at a counter.
 */
export async function getCatalogueOrSample(): Promise<PaintShade[]> {
  if (!isDemoMode()) {
    // READ-ONLY, like getAccessToken() in auth.ts — token refresh happens in
    // middleware, where cookies are writable. Read here rather than importing
    // auth.ts so this module doesn't pull a "use server" graph into pages.
    const jar = await cookies();
    // A guest has no user session, only the token their access code minted. Sending it
    // matters: the backend narrows the catalogue to the companies that code unlocks, so
    // the guest studio is served a restricted list rather than being handed everything
    // and asked to filter itself.
    const token =
      jar.get(config.accessCookie)?.value ?? jar.get(config.guestCookie)?.value ?? null;
    if (token) {
      try {
        return await fetchMyCatalogue(token);
      } catch {
        // Nothing to fall through TO. Both fallbacks below are wrong for a signed-in
        // caller: the public catalogue is every company in the market, and the bundled
        // sample is a made-up company ("Sample palette") with made-up codes. Either one
        // shows a shop paint it cannot sell and a customer paint their shop does not
        // stock — in the portal that meant the sample company sitting in the list of
        // what a code could unlock. An empty catalogue reads as "nothing loaded", which
        // is true and recoverable; an invented one reads as stock.
        return [];
      }
    }
  }
  try {
    const live = await fetchCatalogue();
    return live.length > 0 ? live : [...SHADES];
  } catch {
    return [...SHADES];
  }
}
