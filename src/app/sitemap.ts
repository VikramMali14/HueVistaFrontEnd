import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { SHOWCASE_CONTENT } from "@/lib/showcase";

/**
 * The public, indexable routes — the ones a signed-out visitor (or a payment
 * processor reviewing the site) can actually reach.
 *
 * Deliberately excludes everything behind a session, the tokenised /share and /m
 * URLs, and the per-shop /store/[slug] kiosks: a kiosk link belongs to one shop's
 * counter, not to a search result. The editorial routes are included only when
 * SHOWCASE_CONTENT publishes them — while it is blank they 404, and listing a 404
 * in a sitemap is worse than omitting it.
 *
 * The five legal pages carry the same priority as the product pages on purpose:
 * they are what a payment processor's review looks for first.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entry = (
    path: string,
    priority: number,
    changeFrequency: "monthly" | "weekly" | "yearly",
  ) => ({ url: `${site.origin}${path}`, lastModified: now, changeFrequency, priority });

  return [
    entry("/", 1.0, "weekly"),
    entry("/method", 0.8, "monthly"),
    entry("/pricing", 0.9, "monthly"),
    entry("/catalogue", 0.8, "weekly"),
    entry("/studio", 0.7, "monthly"),
    entry("/trial", 0.7, "monthly"),
    entry("/redeem", 0.6, "monthly"),
    entry("/legal/contact", 0.6, "yearly"),
    entry("/legal/terms", 0.5, "yearly"),
    entry("/legal/privacy", 0.5, "yearly"),
    entry("/legal/refunds", 0.5, "yearly"),
    entry("/legal/delivery", 0.5, "yearly"),
    ...(SHOWCASE_CONTENT
      ? [
          entry("/gallery", 0.6, "monthly"),
          entry("/work", 0.6, "monthly"),
          entry("/journal", 0.6, "monthly"),
        ]
      : []),
  ];
}
