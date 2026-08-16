import type { PdfShade } from "./pdf-export";
import { displayCodeOf, type ShadeCodeScheme } from "./shade-codes";
import type { ProjectComboShade } from "./types";

/**
 * A colour-board combination's shades, printed under the shop's own display rules.
 *
 * Three decisions, all the shop's and none of this screen's: whether the paint name is
 * shown at all, whether the manufacturer's code is printed raw or encoded into the shop's
 * customer-facing pattern, and the colour itself.
 *
 * <p>This is shared rather than repeated because the same sheet is now built from three
 * places — the studio that first downloaded the board, the render page that reprints it
 * with the AI image on the end, and the /ai-images shelf that prints one picture on its
 * own. A board that printed "Asian Paints Ivory Mist 7112" because it happened to be
 * rebuilt from a different screen would undo the shop's whole numbering scheme in the one
 * artefact the customer keeps, and it would do it silently.
 *
 * @param scheme the caller's shade-code scheme, or null. Null means "not loaded, or this
 *   account has no shop", and the cautious reading of null is the strict one: hide the
 *   manufacturer's codes. Guessing the other way leaks a shop's real codes onto paper it
 *   deliberately keeps them off.
 */
export function printableShades(
  scheme: ShadeCodeScheme | null,
  shades: ProjectComboShade[] | null | undefined,
): PdfShade[] {
  const hideNames = scheme?.showNames === false;
  const hideRawCodes = !scheme?.showRealCodes;
  return (shades ?? []).map((s) => ({
    label: s.regionLabel ?? "Wall",
    name: hideNames ? "" : (s.shadeName ?? "Custom colour"),
    code: s.shadeCode
      ? hideRawCodes
        ? displayCodeOf(scheme, { code: s.shadeCode, hvCode: s.hvCode ?? null })
        : s.shadeCode
      : undefined,
    hex: s.hex,
  }));
}
