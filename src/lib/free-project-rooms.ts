import type { TemplateSpace } from "./api";

/**
 * The shelves the free-project gallery lays out — whether or not anything sits on
 * them yet. The empty ones are the point: an empty "Kitchen" is what tells you
 * five were wanted and none exist.
 *
 * Interiors are shelved by room, exteriors by style, which is why one list
 * carries both and every entry names its space.
 */
export interface RoomShelf {
  space: TemplateSpace;
  /** Sent to the backend as `roomKey`. */
  key: string;
  label: string;
}

export const ROOM_SHELVES: readonly RoomShelf[] = [
  { space: "INTERIOR", key: "LIVING_ROOM", label: "Living room" },
  { space: "INTERIOR", key: "KITCHEN", label: "Kitchen" },
  { space: "INTERIOR", key: "HALL", label: "Hall" },
  { space: "INTERIOR", key: "BEDROOM", label: "Bedroom" },
  { space: "INTERIOR", key: "DINING_ROOM", label: "Dining room" },
  { space: "INTERIOR", key: "BATHROOM", label: "Bathroom" },
  { space: "INTERIOR", key: "OFFICE", label: "Office" },
  { space: "INTERIOR", key: "KIDS_ROOM", label: "Kids' room" },
  { space: "EXTERIOR", key: "TRADITIONAL", label: "Traditional house" },
  { space: "EXTERIOR", key: "MODERN", label: "Modern house" },
  { space: "EXTERIOR", key: "VILLA", label: "Villa" },
  { space: "EXTERIOR", key: "BUNGALOW", label: "Bungalow" },
  { space: "EXTERIOR", key: "APARTMENT_BLOCK", label: "Apartment block" },
  { space: "EXTERIOR", key: "SHOPFRONT", label: "Shopfront" },
];

/** How many rooms each shelf is aiming for. Drives the "3 of 5" counters only. */
export const TARGET_PER_SHELF = 5;

export const SPACE_LABEL: Record<TemplateSpace, string> = {
  INTERIOR: "Interiors",
  EXTERIOR: "Exteriors",
};

/** Label for a room key, falling back to the key itself for anything hand-typed. */
export function roomLabelFor(key: string, fallback?: string | null): string {
  return ROOM_SHELVES.find((s) => s.key === key)?.label ?? fallback ?? key;
}

/** The shelf a space's picker opens on. Total, so callers need no empty case. */
export function firstShelfFor(space: TemplateSpace): RoomShelf {
  return ROOM_SHELVES.find((s) => s.space === space) ?? { space, key: "OTHER", label: "Other" };
}
