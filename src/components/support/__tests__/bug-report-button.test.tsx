// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SupportConversation } from "@/lib/types";
import { BugReportButton } from "../bug-report-button";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    startSupport: vi.fn(),
    requestHumanSupport: vi.fn(),
  },
}));

const CONVO: SupportConversation = {
  id: "conv-1",
  channel: "IN_APP",
  status: "OPEN",
  subject: "Bug report — Studio",
  messages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.startSupport).mockResolvedValue(CONVO);
  vi.mocked(api.requestHumanSupport).mockResolvedValue({ ...CONVO, status: "NEEDS_HUMAN" });
  window.history.replaceState({}, "", "/studio?project=abc-123");
});

async function open() {
  render(<BugReportButton />);
  await userEvent.click(screen.getByRole("button", { name: /feedback/i }));
}

describe("BugReportButton", () => {
  /**
   * The context is the reason this beats an e-mail address. Nobody types their user
   * agent, and a report without one costs a round trip that usually goes unanswered —
   * so the page, the room and the browser travel with the sentence they did write.
   */
  it("sends the description together with what we could see ourselves", async () => {
    await open();

    await userEvent.type(
      screen.getByLabelText("What went wrong?"),
      "Pressed Apply and the wall stayed grey",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    await vi.waitFor(() => expect(api.startSupport).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.startSupport).mock.calls[0]![0]!;
    expect(body.subject).toBe("Bug report — Studio");
    expect(body.message).toContain("Pressed Apply and the wall stayed grey");
    expect(body.message).toContain("/studio?project=abc-123");
    expect(body.message).toContain("Project: abc-123");
    expect(body.message).toContain("Browser:");
  });

  /**
   * A bug goes to a person. The AI agent is good at "how do I…" and can do nothing with
   * "the canvas went blank", so routing a bug through it costs a round trip and annoys
   * somebody who already knows they need a human.
   */
  it("escalates the conversation to a human", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("What went wrong?"), "Upload never finishes");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    await vi.waitFor(() => expect(api.requestHumanSupport).toHaveBeenCalledWith("conv-1"));
    expect(await screen.findByText(/Thank you/)).toBeInTheDocument();
  });

  /**
   * The report is already filed by the time the escalation runs. Telling someone their
   * message failed when it did not is the worse of the two errors.
   */
  it("still confirms when only the escalation fails", async () => {
    vi.mocked(api.requestHumanSupport).mockRejectedValue(new Error("escalation down"));
    await open();
    await userEvent.type(screen.getByLabelText("What went wrong?"), "Colours load blank");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText(/Thank you/)).toBeInTheDocument();
  });

  /**
   * The dialog must not render where the button sits.
   *
   * The studio bar the button lives on carries a `backdrop-filter`, and a filtered
   * element is the containing block for its fixed-position descendants — so a dialog
   * left in place resolved `inset: 0` against a 32px strip of chrome and centred itself
   * inside THAT, arriving pinned to the top of the screen instead of the middle of it.
   * The header's `translateY` slide does the same to the drawer copy of the button. No
   * assertion on the styles can catch this, because the styles were never wrong — only
   * the box they were measured against was. So we pin the fix itself: the dialog leaves
   * the bar entirely and lands on <body>.
   */
  it("renders the dialog outside the bar it was opened from", async () => {
    const bar = document.createElement("div");
    document.body.appendChild(bar);
    render(<BugReportButton />, { container: bar });
    await userEvent.click(screen.getByRole("button", { name: /feedback/i }));

    const dialog = screen.getByRole("dialog", { name: "Report a bug" });
    expect(bar.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
  });

  /** A report with nothing written in it cannot be triaged, so it cannot be sent. */
  it("will not send an empty report", async () => {
    await open();

    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("What went wrong?"), "   ");
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
  });

  it("reports a failed send instead of claiming it went", async () => {
    vi.mocked(api.startSupport).mockRejectedValue(new Error("Network unreachable."));
    await open();
    await userEvent.type(screen.getByLabelText("What went wrong?"), "Everything is broken");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unreachable.");
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
  });
});
