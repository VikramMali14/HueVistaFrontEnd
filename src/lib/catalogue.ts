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

/**
 * The catalogue as the signed-in caller is allowed to see it — a shop gets only the
 * paint companies its distributor assigned it.
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
 * The empty-result fallback to bundled samples is skipped for a restricted shop:
 * "no shades" is a legitimate answer there — a distributor may have granted them
 * nothing yet — and quietly substituting a sample catalogue would show a shop
 * companies it was explicitly not given.
 */
export async function getCatalogueOrSample(): Promise<PaintShade[]> {
  if (!isDemoMode()) {
    // READ-ONLY, like getAccessToken() in auth.ts — token refresh happens in
    // middleware, where cookies are writable. Read here rather than importing
    // auth.ts so this module doesn't pull a "use server" graph into pages.
    const token = (await cookies()).get(config.accessCookie)?.value ?? null;
    if (token) {
      try {
        return await fetchMyCatalogue(token);
      } catch {
        // Fall through to the public catalogue below — a failure here is a
        // backend problem, not a verdict about what this shop may see.
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
