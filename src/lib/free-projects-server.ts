import { config } from "./config";
import { isDemoMode } from "./demo/flag";

// SERVER-ONLY. Reads the public gallery endpoint directly and is imported by
// server components; client code takes the resolved list as a prop.

/**
 * The cache tag the admin console busts after publishing, hiding, editing or
 * deleting.
 *
 * One tag for both public pages on purpose. They read the same shelf, an edit can
 * move a room from one to the other, and the two are cheap to revalidate — so a
 * tag per surface would only create a way for the gallery to go stale because a
 * room was moved off it.
 */
export const PUBLISHED_PROJECTS_TAG = "published-projects";

/** Which public page is asking. See TemplatePlacement on the backend. */
export type TemplateSurface = "GALLERY" | "WORK";

/** One colour on one surface of a published room. */
export interface PublishedColour {
  label: string | null;
  hex: string;
  shadeCode: string | null;
}

/** One entry in the stat row under a portfolio room's story. */
export interface PublishedStat {
  label: string;
  value: string;
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
  /** Which public page the room is filed under. */
  onGallery: boolean;
  onWork: boolean;
  /* Editorial copy, /work only. Absent on most rooms, and absent is normal —
     the portfolio omits whatever section it has nothing for. Already split into
     paragraphs and label/value pairs by the backend, since this is the shape it
     renders in; the admin's own view keeps the raw text it edits. */
  location: string | null;
  projectYear: string | null;
  credit: string | null;
  blurb: string | null;
  story: string[];
  stats: PublishedStat[];
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
export async function fetchPublishedProjects(surface?: TemplateSurface): Promise<PublishedProject[]> {
  // The demo publishes no rooms at all, so there is nothing for `surface` to
  // narrow — every page falls back to its built-in content, which is the state
  // the demo is meant to show.
  if (isDemoMode()) {
    const { demoPublishedProjects } = await import("./demo/server");
    return demoPublishedProjects();
  }
  try {
    const query = surface ? `?surface=${surface}` : "";
    const res = await fetch(`${config.internalApiOrigin}/api/free-projects${query}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300, tags: [PUBLISHED_PROJECTS_TAG] },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as PublishedProject[];
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => r?.slug && r.imageUrl).map(normalise);
  } catch {
    return [];
  }
}

/**
 * Fill in what an older backend, or a partially-written room, leaves out.
 *
 * Every list the pages iterate has to BE a list. A room published before the
 * editorial fields existed comes back with `story` absent, and `.map()` over
 * undefined is a 500 on a marketing page — so the defaults happen once, here,
 * rather than at each of the four places that render one.
 */
function normalise(r: PublishedProject): PublishedProject {
  return {
    ...r,
    imageUrl: absolute(r.imageUrl),
    colours: r.colours ?? [],
    story: r.story ?? [],
    stats: r.stats ?? [],
  };
}

/** The rooms on the /gallery grid. */
export async function fetchGalleryProjects(): Promise<PublishedProject[]> {
  return fetchPublishedProjects("GALLERY");
}

/** The rooms in the /work portfolio. */
export async function fetchWorkProjects(): Promise<PublishedProject[]> {
  return fetchPublishedProjects("WORK");
}

/**
 * Whether the library has anything on it.
 *
 * The signed-in app nav asks this before offering the Library tab, which only
 * makes sense once a room is actually on the shelf.
 *
 * Built on {@link fetchPublishedProjects} rather than a request of its own, so it
 * shares that call's cache entry AND its {@link PUBLISHED_PROJECTS_TAG}: the admin
 * actions that publish, hide or delete a room already bust that tag, which means
 * the tab moves in the same beat as the shelf it points at.
 */
export async function libraryHasRooms(): Promise<boolean> {
  return (await fetchPublishedProjects()).length > 0;
}
