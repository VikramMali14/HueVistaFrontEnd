import { config } from "./config";
import { isDemoMode } from "./demo/flag";

// SERVER-ONLY. Reads the public gallery endpoint directly and is imported by
// server components; client code takes the resolved list as a prop.

/** The cache tag the admin console busts after publishing, hiding or deleting. */
export const PUBLISHED_PROJECTS_TAG = "published-projects";

/** One colour on one surface of a published room. */
export interface PublishedColour {
  label: string | null;
  hex: string;
  shadeCode: string | null;
}

/**
 * A room on the public gallery.
 *
 * The trimmed public shape — no mask URLs, no source project id, no operational
 * counts. See PublicFreeProjectResponse on the backend for why those are absent
 * rather than merely unused here.
 */
export interface PublishedProject {
  slug: string;
  title: string;
  description: string | null;
  space: "INTERIOR" | "EXTERIOR";
  roomLabel: string;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  wallCount: number;
  colours: PublishedColour[];
  publishedAt: string | null;
}

/**
 * Turn an API-relative path into something a browser on the marketing site can
 * load. Identical reasoning to site-assets-server's `absolute`: the API is a
 * different origin in every deployment and these images are shown to anonymous
 * visitors, so they cannot go through the BFF proxy — that exists to attach a
 * session these requests do not have.
 *
 * In S3 mode the backend already hands back an absolute presigned URL, which is
 * left alone.
 */
function absolute(url: string): string {
  return url.startsWith("http") ? url : `${config.apiOrigin}${url}`;
}

/**
 * Every published room, in gallery order.
 *
 * Returns an empty list when the backend is unreachable rather than throwing —
 * the same answer as "nothing is published", and the gallery treats both the same
 * way. An outage should cost the marketing site a page, not a 500.
 *
 * The revalidate window is deliberately short compared with the other marketing
 * fetches. In S3 mode every `imageUrl` here is presigned and expires (an hour by
 * default), so a page cached for longer than that would render with dead image
 * links — the shelf changing rarely is not the constraint, the signature lifetime
 * is. Tagged as well, so publishing something shows up at once instead of leaving
 * an admin refreshing and wondering.
 */
export async function fetchPublishedProjects(): Promise<PublishedProject[]> {
  if (isDemoMode()) {
    const { demoPublishedProjects } = await import("./demo/server");
    return demoPublishedProjects();
  }
  try {
    const res = await fetch(`${config.internalApiOrigin}/api/free-projects`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300, tags: [PUBLISHED_PROJECTS_TAG] },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as PublishedProject[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r?.slug && r.imageUrl)
      .map((r) => ({ ...r, imageUrl: absolute(r.imageUrl), colours: r.colours ?? [] }));
  } catch {
    return [];
  }
}

/**
 * Whether the library has anything on it.
 *
 * The chrome asks this before offering a link to /gallery at all. The page does
 * not exist while the shelf is empty — middleware answers it with a 404, because
 * the fallback behind it is the invented placeholder material (see lib/showcase)
 * — so a permanent link in the header, the footer or the app nav would be a
 * permanent dead end. The link appears when the rooms do.
 *
 * Built on {@link fetchPublishedProjects} rather than a request of its own, so it
 * shares that call's cache entry AND its {@link PUBLISHED_PROJECTS_TAG}: the admin
 * actions that publish, hide or delete a room already bust that tag, which means
 * the links move in the same beat as the page they point at. The middleware keeps
 * its own probe (it runs on the edge, before this cache exists) on a shorter TTL,
 * so the two can disagree for up to a minute right after the first room is
 * published — the link is live slightly before the page is.
 */
export async function libraryHasRooms(): Promise<boolean> {
  return (await fetchPublishedProjects()).length > 0;
}
