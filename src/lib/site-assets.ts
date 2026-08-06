/**
 * The images on the public site an admin can replace without a deploy.
 *
 * A SLOT is a fixed position in the design — "the left pane of the home page's
 * before/after slider" — that the markup knows how to draw. The backend stores
 * at most one image per slot and knows nothing else about them; this file is the
 * registry, and it lives here because adding a slot always means writing the
 * markup that renders it. Changing the PICTURE in a slot is the thing that must
 * never need a deploy, and that is an upload.
 *
 * Every slot is optional. When one is empty the component draws its built-in
 * default, which is what a fresh install shows and what an admin gets back by
 * clearing a slot. Nothing on the marketing site may depend on a slot being
 * filled — the site has to look finished before anybody has uploaded anything.
 */

export interface SiteAssetSlot {
  /** Dotted id, also the storage slot and part of the public URL. */
  id: string;
  /** What the admin console calls it. */
  label: string;
  /** Where it shows up, in the admin's terms — not the component's. */
  where: string;
  /** What makes a good picture here. Shown under the upload control. */
  guidance: string;
  /** The shape the slot is drawn at, as width / height. Used to warn when an
   *  upload is a long way off and would be cropped hard. */
  aspect: number;
  /** Human form of {@link aspect}, e.g. "21:10". */
  aspectLabel: string;
  /** Slots that are only meaningful together, e.g. a before/after pair. */
  group: string;
}

export const SITE_ASSET_GROUPS: Record<string, { title: string; blurb: string }> = {
  "home-compare": {
    title: "Home page · before and after",
    blurb:
      "The drag-to-compare slider in the hero. It is the first thing a visitor sees and the "
      + "one place the product proves itself, so the two photographs should be the same room "
      + "from the same spot in the same light, with nothing changed but the wall colour. "
      + "Until both are uploaded the slider shows two colour washes instead.",
  },
};

export const SITE_ASSET_SLOTS: readonly SiteAssetSlot[] = [
  {
    id: "home.compare.before",
    label: "Before — the untouched room",
    where: "Home page hero, revealed as you drag the handle left",
    guidance: "The room as it was, straight off the camera. No filter, no colour correction.",
    aspect: 21 / 10,
    aspectLabel: "21:10",
    group: "home-compare",
  },
  {
    id: "home.compare.after",
    label: "After — the repainted room",
    where: "Home page hero, the pane on the right",
    guidance:
      "The same frame with the walls repainted. Shoot or render it from the identical position — "
      + "if the furniture moves between the two, the slider stops reading as proof.",
    aspect: 21 / 10,
    aspectLabel: "21:10",
    group: "home-compare",
  },
] as const;

export const SITE_ASSET_SLOT_IDS = SITE_ASSET_SLOTS.map((s) => s.id);

/** One filled slot, as the backend reports it. */
export interface SiteAsset {
  slot: string;
  /** Path on the API, already carrying its cache-busting version. */
  url: string;
  contentType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  updatedAt: string | null;
}

/** slot id → asset, for the slots that have one. */
export type SiteAssetMap = Record<string, SiteAsset>;

export function slotById(id: string): SiteAssetSlot | undefined {
  return SITE_ASSET_SLOTS.find((s) => s.id === id);
}

/**
 * How far an uploaded image is from the shape its slot is drawn at, as a ratio
 * of the two aspect ratios (1 = exact, 1.3 = a third off).
 *
 * Only ever a warning. A picture that is the wrong shape still works — it is
 * cropped to fill — and an admin who knows the crop is fine should not be
 * stopped by a number.
 */
export function aspectDrift(asset: SiteAsset, slot: SiteAssetSlot): number | null {
  if (!asset.width || !asset.height) return null;
  const actual = asset.width / asset.height;
  return actual > slot.aspect ? actual / slot.aspect : slot.aspect / actual;
}

/** Drift past this reads as "you will lose a lot of this picture". */
export const ASPECT_WARN_AT = 1.25;
