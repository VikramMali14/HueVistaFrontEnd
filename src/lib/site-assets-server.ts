import { config } from "./config";
import { isDemoMode } from "./demo/flag";
import type { SiteAsset, SiteAssetMap } from "./site-assets";

// SERVER-ONLY. Reads the backend directly and is imported by server components
// and server actions; client code takes the resolved map as a prop.

/** The cache tag the admin console busts after an upload. */
export const SITE_ASSETS_TAG = "site-assets";

/**
 * Turn the API-relative path the backend hands back into something a browser on
 * the marketing site can actually load.
 *
 * The API is a different origin from the site in every deployment, and these
 * images are shown to anonymous visitors, so they cannot go through the BFF
 * proxy the way authenticated calls do — the BFF exists to attach a session
 * these requests do not have. An absolute URL to the public route is the whole
 * mechanism. (No CORS involved: an <img> renders cross-origin by default.)
 */
function absolute(url: string): string {
  return url.startsWith("http") ? url : `${config.apiOrigin}${url}`;
}

/**
 * Every filled slot, keyed by slot id.
 *
 * Returns an empty map when the backend is unreachable rather than throwing.
 * That is the same answer as "nothing has been uploaded yet", and it is the
 * right one: the pages that read this all draw a built-in default for an empty
 * slot, so a backend outage costs the marketing site its photographs and
 * nothing else. Failing the render instead would take the whole home page down
 * over a decorative image.
 */
export async function fetchSiteAssets(): Promise<SiteAssetMap> {
  if (isDemoMode()) {
    // The offline demo keeps uploads in memory as data URLs — already absolute,
    // so they skip the origin-prefixing below.
    const { demoSiteAssetMap } = await import("./demo/server");
    return demoSiteAssetMap() as SiteAssetMap;
  }
  try {
    const res = await fetch(`${config.internalApiOrigin}/api/site-assets`, {
      headers: { Accept: "application/json" },
      // Long, because these change a handful of times a year — and tagged, so an
      // admin upload can drop it immediately rather than leaving them staring at
      // the old picture wondering whether the upload worked.
      next: { revalidate: 3600, tags: [SITE_ASSETS_TAG] },
    });
    if (!res.ok) return {};
    const rows = (await res.json()) as SiteAsset[];
    const map: SiteAssetMap = {};
    for (const row of rows) {
      if (row?.slot && row.url) map[row.slot] = { ...row, url: absolute(row.url) };
    }
    return map;
  } catch {
    return {};
  }
}

/** The URL in one slot, or null when it is empty and the default should show. */
export function assetUrl(assets: SiteAssetMap, slot: string): string | null {
  return assets[slot]?.url ?? null;
}
