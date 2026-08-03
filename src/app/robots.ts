import type { MetadataRoute } from "next";
import { site } from "@/lib/config";

/**
 * There was no robots.txt at all, so crawlers had no steer and no sitemap pointer.
 *
 * The disallow list is the set of routes that either need a session (and answer with a
 * redirect to /sign-in for a crawler) or are per-visitor surfaces with nothing stable
 * to index: the signed-in app under (app), the auth pages, the BFF proxy, and the
 * tokenised share/handoff/kiosk-code URLs. Keeping them out saves crawl budget and
 * stops a share token from turning up in a search result.
 *
 * The editorial routes (/gallery, /work, /journal) are NOT listed: middleware already
 * answers them with a real 404 while NEXT_PUBLIC_SHOWCASE_CONTENT is blank, which
 * drops them from an index rather than merely asking politely.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/admin",
          "/assigned-products",
          "/atelier",
          "/color-finder",
          "/dashboard",
          "/inbox",
          "/network",
          "/portal",
          "/products",
          "/subscription",
          "/sign-in",
          "/join",
          "/bff/",
          "/api/",
          "/share/",
          "/m/",
        ],
      },
    ],
    sitemap: `${site.origin}/sitemap.xml`,
    host: site.origin,
  };
}
