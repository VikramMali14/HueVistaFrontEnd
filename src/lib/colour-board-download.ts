import { HttpError } from "./http-error";
import type { ColourBoardResult } from "./types";

/**
 * The order in which a colour board is built, charged for and handed over.
 *
 * This lives apart from the studio component for one reason: it is the only place
 * in the studio that spends money, and the order of its three steps is the whole
 * behaviour. Charging is a one-way `pdfDownloadsUsed + 1` on the server — there is
 * no decrement and no refund endpoint anywhere in the billing module — so a step
 * that can fail must never run after the charge.
 *
 * Building can fail (a full board on a low-memory phone is the case the studio's
 * error message names), so building goes first. Someone over quota pays for that
 * with a few hundred milliseconds of wasted canvas work, which is the cheaper of
 * the two mistakes, and a rare one: the download button is already disabled once
 * the tray knows the remaining count is zero.
 *
 * The charge step now also REPORTS what was on the board — the shades, per page, per
 * region — because the board is built entirely here and this is the only moment that
 * information exists anywhere the server can see. Everything the closing flow does is
 * built on it, which makes the fail-open below more consequential than it used to be:
 * a board handed over after a network error is neither charged nor recorded, so it
 * never becomes a combination and never moves the project towards closing. That is
 * still the right way to be wrong — a customer standing at a counter should not lose
 * their board to a flaky connection — but it is now a real gap and not just an
 * undercount.
 */
export type ColourBoardDownloadOutcome =
  | { status: "downloaded"; result?: ColourBoardResult }
  /** The board was handed over AND it was this project's last one, so the project
   *  closed. The studio sends the customer on to choose a combination and render it. */
  | { status: "closed"; result: ColourBoardResult }
  /** The file could not be made. Nothing was charged. */
  | { status: "build-failed" }
  /** The paying plan is out of downloads. Nothing was handed over. */
  | { status: "quota-spent"; message: string };

export interface ColourBoardDownloadSteps {
  /** Render the board. Throws when the device cannot make the file. */
  build: () => Blob;
  /** Reserve one download against the paying plan and record what was on the board.
   *  Throws 402 when spent. */
  charge: () => Promise<ColourBoardResult>;
  /** Hand the finished file to the browser. */
  save: (blob: Blob) => void;
  /** Called with the post-charge result, so the tray can show what is left. */
  onResult?: (result: ColourBoardResult) => void;
}

export async function runColourBoardDownload(
  steps: ColourBoardDownloadSteps,
): Promise<ColourBoardDownloadOutcome> {
  let blob: Blob;
  try {
    blob = steps.build();
  } catch {
    return { status: "build-failed" };
  }

  let result: ColourBoardResult | undefined;
  try {
    result = await steps.charge();
    steps.onResult?.(result);
  } catch (e) {
    if (e instanceof HttpError && e.status === 402) {
      return {
        status: "quota-spent",
        message: e.message || "You've used this month's colour-board downloads.",
      };
    }
    // Anything else — a network hiccup, an older backend without the endpoint —
    // fails OPEN. The server-side quota governs real usage either way, and a
    // customer standing at a counter should not lose their board to a flaky
    // connection. Undercounting is the acceptable direction to be wrong in.
  }

  steps.save(blob);
  // The file is handed over BEFORE the closed branch, so a customer always gets the
  // board they just paid for even if the studio then navigates them onward.
  if (result?.closed) {
    return { status: "closed", result };
  }
  return { status: "downloaded", result };
}
