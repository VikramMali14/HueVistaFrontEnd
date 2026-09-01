/**
 * The paint plan: which of a room's surfaces are actually being painted, and what each
 * one is in the scheme.
 *
 * <b>Why a room needs one.</b> A project's regions are everything anybody found or drew:
 * wall detection returns what it sees, and the Mask Studio adds whatever the customer
 * outlines. Both answer "what is paintable here", and neither answers "what am I
 * painting" — which is the question the customer actually has. Somebody who marks out ten
 * surfaces to get the shapes right and wants three of them coloured had no way to say so:
 * every region went into the suggestions, every "Apply all" put paint on all ten, and the
 * colour board printed ten rows for a three-colour job.
 *
 * Taking a wall OUT is not the same as deleting it. A deleted detected wall cannot come
 * back without re-running detection, which costs a credit — and a wall left out of this
 * scheme is very often wanted back in the next one, which is the whole point of trying
 * combinations. So a wall out of the plan keeps its mask, its shape and its colour, and
 * is simply not one of the surfaces being coloured.
 */

import type { RegionKind } from "./types";

/**
 * The roles a wall can play, in the order they are offered and applied.
 *
 * These are the names the studio, the Mask Studio, the plan panel and the backend all
 * use. They were three different vocabularies once — "Border" here, "Trim" there,
 * "Trim &amp; Frames" from the detector — and a customer picking colours watched the
 * surfaces rename themselves halfway through the job.
 */
export const WALL_ROLES: ReadonlyArray<{
  kind: RegionKind;
  label: string;
  /** One line saying what the role is FOR, shown under the picker. */
  hint: string;
}> = [
  { kind: "MAIN_WALL", label: "Main wall", hint: "The biggest surface — the room's base colour." },
  { kind: "ACCENT_WALL", label: "Accent wall", hint: "The one wall that stands out." },
  { kind: "OTHER_WALL", label: "Another wall", hint: "A wall that sits with the main one." },
  { kind: "TRIM", label: "Trim & frames", hint: "Borders: door and window frames, skirting." },
];

/** The label for a role — falls back to a plain "Wall" for an unassigned surface. */
export function roleLabel(kind: RegionKind): string {
  return WALL_ROLES.find((r) => r.kind === kind)?.label ?? "Wall";
}

/**
 * The order colours are handed out in: base first, then the wall that answers it, then
 * any other walls, then the trim.
 *
 * MANUAL — a surface drawn by hand and never given a role — sits with the other walls
 * rather than last. It is somebody's own wall, not an afterthought.
 */
const ROLE_RANK: Record<RegionKind, number> = {
  MAIN_WALL: 0,
  ACCENT_WALL: 1,
  OTHER_WALL: 2,
  MANUAL: 3,
  TRIM: 4,
};

/** Absent means IN — every region behaved that way before the flag existed. */
export function isInPlan(region: { inPlan?: boolean }): boolean {
  return region.inPlan !== false;
}

/**
 * The walls being painted, in the order a palette's colours are handed to them.
 *
 * Sorted by role and stable within it, so the first colour of a scheme lands on the main
 * wall wherever that wall happens to sit in the detector's own numbering — and so the
 * swatches in a suggestion card read left to right the way the scheme was built:
 * base, accent, the other walls, trim.
 */
export function planWalls<T extends { kind: RegionKind; inPlan?: boolean }>(
  regions: ReadonlyArray<T> | undefined,
): T[] {
  return (regions ?? [])
    .filter(isInPlan)
    .map((region, i) => ({ region, i }))
    .sort((a, b) => ROLE_RANK[a.region.kind] - ROLE_RANK[b.region.kind] || a.i - b.i)
    .map(({ region }) => region);
}

/**
 * "3 walls" / "1 wall" — how many surfaces a scheme is being built for.
 *
 * Its own function because the same count is said in three places (the plan panel's
 * summary, the suggestions intro, the wall strip's chip) and a page that says "3 walls"
 * in one and "3 wall" in another is the kind of detail that makes a screen feel unfinished.
 */
export function wallCount(n: number): string {
  return `${n} wall${n === 1 ? "" : "s"}`;
}

/** "3 colours" / "1 colour" — the size of the combinations a plan will produce. */
export function colourCount(n: number): string {
  return `${n} colour${n === 1 ? "" : "s"}`;
}
