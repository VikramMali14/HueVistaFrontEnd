// @vitest-environment jsdom
/**
 * The panel that stands between "Download PDF" and an irreversible download.
 *
 * A project hands over ONE colour board and then closes, so the press the customer
 * thinks is "save a copy" is actually "finish the job". Everything asserted here is a
 * number they would otherwise only find out afterwards.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardDownloadConfirm } from "../board-download-confirm";

function open(props: Partial<React.ComponentProps<typeof BoardDownloadConfirm>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <BoardDownloadConfirm
      pages={5}
      boardsLeft={1}
      closesProject
      withAiImage={false}
      monthlyLeft={null}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("BoardDownloadConfirm", () => {
  it("says how many PDFs this project gets, and that this one ends it", () => {
    open();
    expect(screen.getByText(/This is the only PDF for this project\./)).toBeInTheDocument();
    expect(screen.getByText(/finishes the job/)).toBeInTheDocument();
  });

  it("counts the options, and the AI image separately from them", () => {
    open({ pages: 5, withAiImage: true });
    // Six sheets: five options the customer chose between, plus their image.
    expect(screen.getByText(/6 pages — 5 colour options/)).toBeInTheDocument();
    expect(screen.getByText(/plus your AI image on the last page/)).toBeInTheDocument();
  });

  it("does not promise an AI image the board will not carry", () => {
    open({ pages: 3, withAiImage: false });
    expect(screen.getByText(/3 pages — 3 colour options/)).toBeInTheDocument();
    expect(screen.queryByText(/AI image/)).not.toBeInTheDocument();
  });

  it("keeps the plan's monthly allowance as a separate line from the project's", () => {
    open({ boardsLeft: 1, monthlyLeft: 4 });
    expect(screen.getByText(/This is the only PDF for this project\./)).toBeInTheDocument();
    expect(
      screen.getByText(/4 colour-board downloads left on your plan this month/),
    ).toBeInTheDocument();
  });

  it("says nothing about a plan whose downloads are unlimited", () => {
    open({ monthlyLeft: null });
    expect(screen.queryByText(/on your plan this month/)).not.toBeInTheDocument();
  });

  it("downloads on confirm and leaves everything alone on cancel", async () => {
    const { onConfirm, onCancel } = open();
    await userEvent.click(screen.getByRole("button", { name: /Download the PDF/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Keep choosing/ }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("closes on Escape — backing out must never be harder than going ahead", async () => {
    const { onCancel, onConfirm } = open();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
