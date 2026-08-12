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
          "/studio",
          "/colour-finder",
          "/dashboard",
          "/inbox",
          // The in-app view of the library. Its public twin, /gallery, is the one
          // meant to be indexed — this one only redirects a crawler to /sign-in.
          "/library",
          "/network",
          "/portal",
          "/products",
          "/plan",
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
