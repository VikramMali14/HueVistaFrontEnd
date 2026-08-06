/**
 * The real photography for /method, keyed by step.
 *
 * The page explains a visual product with abstract gradient plates labelled
 * "FIG. I" and "FIG. II" — not one real room, not one screenshot of the app.
 * For a tool whose entire pitch is "see it before the can opens", that is the
 * biggest missed opportunity on the site: the thing being described is exactly
 * the thing that should be shown.
 *
 * The page renders a photograph for any step listed here and falls back to the
 * coloured plate for any step that is not. So filling this in is the whole job:
 * drop the files in /public/method/ and add the entry.
 *
 * What each step wants:
 *   I    a real room photo, as a shopkeeper would receive it on WhatsApp —
 *        ordinary light, ordinary clutter, taken on a phone
 *   II   the same photo after the clean-up, side by side with the original
 *   III  a screenshot of the studio with the walls detected and outlined
 *   IV   a screenshot mid-correction, with a pillar being added or removed
 *   V    the same room painted — the before/after that sells the product
 *   VI   the WhatsApp hand-over as the customer receives it, codes attached
 *
 * A fifteen-second screen recording of the studio belongs on this page too;
 * it needs a <video>, not this map.
 */
export interface MethodFigure {
  src: string;
  /** Describe what is IN the picture — these images are the argument. */
  alt: string;
}

export const METHOD_FIGURES: Partial<Record<string, MethodFigure>> = {
  // "I.": { src: "/method/step-1-photo.jpg", alt: "A living room photographed on a phone, sofa and window in frame" },
  // "II.": { src: "/method/step-2-cleanup.jpg", alt: "The same room with a hanging wire and clutter tidied out" },
  // "III.": { src: "/method/step-3-walls.png", alt: "The studio with each wall outlined as a separate surface" },
  // "IV.": { src: "/method/step-4-correction.png", alt: "A pillar being removed from the detected wall by hand" },
  // "V.": { src: "/method/step-5-painted.jpg", alt: "The room's walls in terracotta, light and shadows unchanged" },
  // "VI.": { src: "/method/step-6-handover.png", alt: "The finished picture sent on WhatsApp with the shade code" },
};
