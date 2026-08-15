import type { PublishedProject } from "./free-projects-server";
import type { WorkCard, WorkDetail } from "./work";

/**
 * A room an admin published, as the "Our work" page shows it.
 *
 * Type-only imports on both sides, so this stays a plain module the client
 * bundle can hold — `free-projects-server` is server-only, and importing its
 * types costs nothing at runtime.
 *
 * The rule throughout: read what the room actually is, and let the editorial
 * fields override. A room can be put on the portfolio with none of them filled
 * in — the admin picks a destination and presses publish — and it still has a
 * photograph, the shades on its walls, the kind of room it is, and the month it
 * went up. That is a real portfolio entry. Everything the admin types on top of
 * it is the story only a person can tell.
 */

/** "2026" from the publish timestamp; empty if it can't be read. */
function yearOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : String(d.getFullYear());
}

/** What a room is, when nobody has written a category for it. */
function categoryOf(p: PublishedProject): string {
  return p.roomLabel || (p.space === "EXTERIOR" ? "Exterior" : "Interior");
}

/**
 * The line above the title: the lead shade's code, and how many others there are.
 *
 * A room painted from the catalogue has codes and they are the most useful thing
 * on the card — the whole claim of the site is that these are real, orderable
 * shades. One painted freehand has none, so it says what it does have instead.
 */
function codeOf(p: PublishedProject): string {
  const lead = p.colours[0];
  const rest = p.colours.length > 1 ? `+${p.colours.length - 1} more` : null;
  const code = [lead?.shadeCode, rest].filter(Boolean).join(" · ");
  return code || `${p.wallCount} ${p.wallCount === 1 ? "surface" : "surfaces"}`;
}

export function workCardOf(p: PublishedProject): WorkCard {
  const lead = p.colours[0];
  return {
    slug: p.slug,
    title: p.title,
    category: categoryOf(p),
    location: p.location || categoryOf(p),
    year: p.projectYear || yearOf(p.publishedAt),
    code: codeOf(p),
    swatch: lead?.hex ?? "var(--rule-strong)",
    // Only ever seen if the photograph fails to load, but the card needs a tone
    // to fall back to and the picture is the real content either way.
    tone: p.space === "EXTERIOR" ? "sage" : "slate",
    aspect: p.imageWidth && p.imageHeight ? `${p.imageWidth} / ${p.imageHeight}` : "4 / 3",
    imageUrl: p.imageUrl,
    alt: p.description || `${p.title} — ${categoryOf(p)} recoloured in HueVista`,
  };
}

export function workDetailOf(p: PublishedProject): WorkDetail {
  return {
    ...workCardOf(p),
    blurb:
      p.blurb
      || p.description
      || `${categoryOf(p)} recoloured from a single photograph — ${p.wallCount} `
        + `${p.wallCount === 1 ? "surface" : "surfaces"}, shades from the live catalogue.`,
    credit: p.credit || "",
    story: p.story,
    // The palette is the one section that is never invented: these are the
    // colours actually on the walls of the picture above it.
    palette: p.colours.map((c) => ({
      hex: c.hex,
      name: c.shadeCode || c.label || c.hex,
      surface: c.label || "Wall",
    })),
    stats: p.stats.map((s) => [s.label, s.value] as const),
  };
}
