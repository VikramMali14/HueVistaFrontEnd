/**
 * The identity of one colour combination, for telling two board pages apart.
 *
 * A colour board is a set of options the customer chooses between — first on paper at
 * the counter, then again on the render page, where the chosen one becomes the AI
 * image. Two pages carrying the same colours on the same walls are not two options:
 * they are the same option printed twice, and they cost one of the five pictures the
 * board gets and produce two cards on the render page that nobody can tell apart.
 *
 * What counts as "the same" is the region-to-colour mapping and nothing else:
 *
 *  - The COLOUR is the hex, not the shade code. Two catalogue entries that resolve to
 *    the same hex paint the same picture, so keeping both would defeat the point even
 *    though the sheet would print two different shade numbers.
 *  - The REGION is its backend id where it has one, falling back to the label. A region
 *    drawn in this session but not yet saved has no id, and comparing those on label
 *    keeps the check working rather than quietly letting every unsaved wall through.
 *  - ORDER does not count. The regions are listed in whatever order the studio holds
 *    them, and a combination is not a different combination for being enumerated
 *    differently, so the parts are sorted before joining.
 */
export interface ComboPart {
  /** Backend region id, when the region has been saved. */
  regionId?: number | null;
  /** Region label — the fallback identity, and what the sheet prints. */
  label: string;
  /** #rrggbb. Case is not significant. */
  hex: string;
}

export function comboFingerprint(parts: readonly ComboPart[]): string {
  return parts
    .map((p) => `${p.regionId != null ? `#${p.regionId}` : p.label.trim().toLowerCase()}=${p.hex.trim().toLowerCase()}`)
    .sort()
    .join("|");
}

/** True when `parts` names the same colours on the same regions as one of `existing`. */
export function comboAlreadyOnBoard(
  existing: ReadonlyArray<ReadonlyArray<ComboPart>>,
  parts: readonly ComboPart[],
): number {
  const wanted = comboFingerprint(parts);
  return existing.findIndex((e) => comboFingerprint(e) === wanted);
}
