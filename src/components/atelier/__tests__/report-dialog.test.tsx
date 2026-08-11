// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportDialog } from "../report-dialog";

function open(props: Partial<React.ComponentProps<typeof ReportDialog>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = props.onClose ?? vi.fn();
  render(
    <ReportDialog
      hadCleanedImage={props.hadCleanedImage ?? true}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );
  return { onSubmit, onClose };
}

describe("ReportDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("will not send a report that names no problem", async () => {
    const { onSubmit } = open();
    // The backend rejects an empty issue list too — the button says so first,
    // rather than spending a round trip to learn it.
    expect(screen.getByRole("button", { name: /send report/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the ticked issues and the note", async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();

    await user.click(screen.getByLabelText(/walls weren't detected properly/i));
    await user.type(screen.getByLabelText(/anything else/i), "  the ceiling was painted  ");
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        ["MASK_NOT_GENERATED_PROPERLY"],
        "the ceiling was painted",
      ),
    );
  });

  it("sends every ticked issue, not just the last one", async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();

    await user.click(screen.getByLabelText(/photo wasn't cleaned up properly/i));
    await user.click(screen.getByLabelText(/walls weren't detected properly/i));
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [issues] = vi.mocked(onSubmit).mock.calls[0]!;
    expect(issues).toEqual(
      expect.arrayContaining(["IMAGE_NOT_CLEANED_PROPERLY", "MASK_NOT_GENERATED_PROPERLY"]),
    );
    expect(issues).toHaveLength(2);
  });

  it("sends a ticked box on its own — the note is optional", async () => {
    const user = userEvent.setup();
    const { onSubmit } = open();

    await user.click(screen.getByLabelText(/walls weren't detected properly/i));
    await user.click(screen.getByRole("button", { name: /send report/i }));

    // Asking for prose would filter out exactly the reports worth having: the
    // ones from a customer standing at a shop counter.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(["MASK_NOT_GENERATED_PROPERLY"], ""));
  });

  it("hides the clean-up option when the clean-up never ran", () => {
    open({ hadCleanedImage: false });
    // Offering "the photo wasn't cleaned up properly" for a run that produced no
    // cleaned image invites a report about a stage that did not happen.
    expect(screen.queryByLabelText(/photo wasn't cleaned up properly/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/walls weren't detected properly/i)).toBeInTheDocument();
  });

  it("confirms the report landed instead of leaving the form up", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByLabelText(/walls weren't detected properly/i));
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() => expect(screen.getByText(/thank you — we have it/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /send report/i })).not.toBeInTheDocument();
  });

  it("keeps the form and the typing when sending fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Network is down."));
    open({ onSubmit });

    await user.click(screen.getByLabelText(/walls weren't detected properly/i));
    await user.type(screen.getByLabelText(/anything else/i), "half the wall is missing");
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network is down."));
    // Losing what they wrote on a failed send is how a report never gets made twice.
    expect(screen.getByLabelText(/anything else/i)).toHaveValue("half the wall is missing");
    expect(screen.getByLabelText(/walls weren't detected properly/i)).toBeChecked();
  });
});
