import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { libraryHasRooms } from "@/lib/free-projects-server";
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
 * /gallery is the exception, and the reason this is async. It is no longer
 * editorial: it lists the rooms an admin has published and opens by itself once
 * the shelf is not empty, so tying it to the flag alone left the one page here
 * built from real photographs out of the sitemap for as long as the flag stayed
 * blank. It is listed when either the flag or the shelf says it exists — and a
 * backend that cannot be reached reads as an empty shelf, which omits it.
 *
 * The five legal pages carry the same priority as the product pages on purpose:
 * they are what a payment processor's review looks for first.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const galleryLive = SHOWCASE_CONTENT || (await libraryHasRooms());
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
    entry("/guest-studio", 0.7, "monthly"),
    entry("/trial", 0.7, "monthly"),
    entry("/unlock", 0.6, "monthly"),
    entry("/legal/about", 0.6, "yearly"),
    entry("/legal/contact", 0.6, "yearly"),
    entry("/legal/terms", 0.5, "yearly"),
    entry("/legal/privacy", 0.5, "yearly"),
    entry("/legal/refunds", 0.5, "yearly"),
    entry("/legal/delivery", 0.5, "yearly"),
    ...(galleryLive ? [entry("/gallery", 0.6, "monthly")] : []),
    ...(SHOWCASE_CONTENT
      ? [entry("/work", 0.6, "monthly"), entry("/journal", 0.6, "monthly")]
      : []),
  ];
}
