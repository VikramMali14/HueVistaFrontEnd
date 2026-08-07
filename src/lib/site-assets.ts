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
  method: {
    title: "How it works · the six figures",
    blurb:
      "One picture per step of /method. The page explains a visual product, so an abstract "
      + "gradient labelled FIG. I is the weakest illustration it could carry — these are the "
      + "argument, not decoration. Photographs for the first two, screenshots of the real "
      + "studio for the middle two, the finished room and the hand-over for the last two. "
      + "Any step left empty keeps its coloured plate, so filling them in one at a time is fine.",
  },
  editorial: {
    title: "Gallery & journal",
    blurb:
      "The two large plates on the editorial pages. Neither page depends on them — both draw "
      + "their coloured plate when the slot is empty — but each is the only picture in a long "
      + "stretch of type, so a real photograph carries a lot of weight here.",
  },
};

/**
 * The six /method figures, in page order.
 *
 * Kept beside the page's own step numerals ("I.", "II.", …) rather than derived
 * from them: the numerals are Roman because the page sets them that way, and a
 * storage slot named `method.step.iv` would be a decision about typography stored
 * in a database. The map from one to the other lives in the page.
 */
const METHOD_FIGURE_GUIDANCE: ReadonlyArray<{ label: string; where: string; guidance: string }> = [
  {
    label: "I · The photo",
    where: "How it works, step one",
    guidance:
      "A room photographed on a phone, as a shopkeeper would receive it on WhatsApp — "
      + "ordinary light, ordinary clutter. It should look like a customer took it, not a studio.",
  },
  {
    label: "II · The clean-up",
    where: "How it works, step two",
    guidance:
      "The same photo after the clean-up, with the wire or the clutter gone. Best read as a "
      + "before/after pair in one frame, so the difference is visible without scrolling back.",
  },
  {
    label: "III · The walls",
    where: "How it works, step three",
    guidance:
      "A screenshot of the studio with the walls detected and outlined as separate surfaces. "
      + "The real interface, not a mock-up.",
  },
  {
    label: "IV · The correction",
    where: "How it works, step four",
    guidance:
      "A screenshot mid-correction — a pillar or a picture frame being added to or removed "
      + "from a detected wall. This is the step that says the tool is honest about getting it "
      + "wrong sometimes, so show it being fixed.",
  },
  {
    label: "V · The colour",
    where: "How it works, step five",
    guidance:
      "The same room painted. The before/after that sells the product: light and shadows "
      + "unchanged, only the wall a different colour.",
  },
  {
    label: "VI · The hand-over",
    where: "How it works, step six",
    guidance:
      "The finished picture as the customer receives it — a WhatsApp thread or the colour "
      + "board, with the shade codes attached.",
  },
];

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
  // The six /method figures. Generated rather than written out six times: they
  // differ only in their number and their guidance, and a hand-written block per
  // figure is six chances for the shape or the group to drift apart.
  ...METHOD_FIGURE_GUIDANCE.map((f, i) => ({
    id: `method.step.${i + 1}`,
    label: f.label,
    where: f.where,
    guidance: f.guidance,
    aspect: 4 / 5,
    aspectLabel: "4:5 (upright)",
    group: "method",
  })),
  {
    id: "gallery.counter",
    label: "At the counter",
    where: "Gallery, the dark band below the rooms",
    guidance:
      "A paint counter with someone being shown a colour on a screen. The section argues that "
      + "seeing the wall change is what turns “let me think” into an order, so a picture of "
      + "that happening beats a picture of a shop front.",
    aspect: 5 / 4,
    aspectLabel: "5:4",
    group: "editorial",
  },
  {
    id: "journal.featured",
    label: "Featured essay",
    where: "Journal, beside the lead essay",
    guidance:
      "Whatever the lead essay is about — light through a window, a shade card on a counter. "
      + "It sits next to a large headline, so something with a quiet, uncluttered half works "
      + "better than a busy frame.",
    aspect: 5 / 4,
    aspectLabel: "5:4",
    group: "editorial",
  },
] as const;

export const SITE_ASSET_SLOT_IDS = SITE_ASSET_SLOTS.map((s) => s.id);

/** The slot holding figure `n` (1-6) of /method. */
export function methodFigureSlot(n: number): string {
  return `method.step.${n}`;
}

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

/**
 * The size ceiling the backend enforces on a site asset (SiteAssetService), and
 * the budget the browser re-encodes a crop to fit.
 *
 * Named here rather than only on the server because the point is that nobody
 * should ever meet it: the uploader crops and re-encodes under this figure before
 * a byte is sent, so "that image is too large" stops being an error a person has
 * to solve with other software. The backend keeps its own check — a limit that
 * only exists in the browser is not a limit — and the two are deliberately the
 * same number so a file this side accepts is never refused on the other.
 */
export const SITE_ASSET_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Longest side of an uploaded slot image.
 *
 * Every slot is drawn at most a full viewport wide, so 2400px covers a 2× screen
 * with room to spare; beyond that the extra pixels are downloaded by every
 * visitor and thrown away by the browser on the way to the screen.
 */
export const SITE_ASSET_MAX_DIM = 2400;
