import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../http-error";
import { runColourBoardDownload } from "../colour-board-download";
import type { ColourBoardResult, PdfAllowance } from "../types";

const allowance: PdfAllowance = {
  imagesPerPdf: 8,
  monthlyLimit: 100,
  used: 1,
  remaining: 99,
  unlimited: false,
};

/** A board that left the project with one still to give. */
const result: ColourBoardResult = { allowance, boardsUsed: 1, boardsAllowed: 2, closed: false };

/** The board that finished the job. */
const closingResult: ColourBoardResult = { ...result, boardsUsed: 2, closed: true };

function steps(overrides: Partial<Parameters<typeof runColourBoardDownload>[0]> = {}) {
  return {
    build: vi.fn(() => new Blob(["%PDF"], { type: "application/pdf" })),
    charge: vi.fn(async () => result),
    save: vi.fn(),
    onResult: vi.fn(),
    ...overrides,
  };
}

describe("runColourBoardDownload", () => {
  it("builds the file before charging for it", async () => {
    const order: string[] = [];
    const s = steps({
      build: vi.fn(() => {
        order.push("build");
        return new Blob();
      }),
      charge: vi.fn(async () => {
        order.push("charge");
        return result;
      }),
      save: vi.fn(() => void order.push("save")),
    });

    const outcome = await runColourBoardDownload(s);

    expect(outcome).toEqual({ status: "downloaded", result });
    expect(order).toEqual(["build", "charge", "save"]);
  });

  it("charges nothing when the file cannot be built", async () => {
    // The regression this order exists for. `pdfDownloadsUsed` only ever goes up —
    // there is no refund endpoint — so a board that fails to render on a
    // low-memory phone must not cost the customer one of their downloads.
    const s = steps({
      build: vi.fn(() => {
        throw new Error("out of memory");
      }),
    });

    const outcome = await runColourBoardDownload(s);

    expect(outcome).toEqual({ status: "build-failed" });
    expect(s.charge).not.toHaveBeenCalled();
    expect(s.save).not.toHaveBeenCalled();
  });

  it("withholds the file when the plan is out of downloads", async () => {
    const s = steps({
      charge: vi.fn(async () => {
        throw new HttpError(402, "Monthly PDF download limit reached (5).");
      }),
    });

    const outcome = await runColourBoardDownload(s);

    expect(outcome).toEqual({
      status: "quota-spent",
      message: "Monthly PDF download limit reached (5).",
    });
    expect(s.save).not.toHaveBeenCalled();
  });

  it("hands the file over anyway when the charge cannot be reached", async () => {
    // Fails open on purpose: the server-side quota is the real gate, and a
    // customer at a shop counter should not lose their board to a dropped
    // connection. Undercounting is the acceptable direction to be wrong in.
    const s = steps({
      charge: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });

    const outcome = await runColourBoardDownload(s);

    expect(outcome).toEqual({ status: "downloaded", result: undefined });
    expect(s.save).toHaveBeenCalledTimes(1);
    expect(s.onResult).not.toHaveBeenCalled();
  });

  it("reports the post-charge result so the tray can show what is left", async () => {
    const s = steps();

    await runColourBoardDownload(s);

    expect(s.onResult).toHaveBeenCalledWith(result);
  });

  it("says so when that board was the one that closed the project", async () => {
    const s = steps({ charge: vi.fn(async () => closingResult) });

    const outcome = await runColourBoardDownload(s);

    expect(outcome).toEqual({ status: "closed", result: closingResult });
  });

  it("still hands over the file on the board that closes the project", async () => {
    // The customer paid for this one. Whatever the studio does next — and it navigates
    // them to the render page — it must not be at the cost of the board itself.
    const s = steps({ charge: vi.fn(async () => closingResult) });

    await runColourBoardDownload(s);

    expect(s.save).toHaveBeenCalledTimes(1);
  });
});
