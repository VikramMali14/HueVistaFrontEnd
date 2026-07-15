// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SupportConversation } from "@/lib/types";
import { SupportWidget } from "../support-widget";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => {
  class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    HttpError,
    api: {
      listSupport: vi.fn(),
      getSupport: vi.fn(),
      startSupport: vi.fn(),
      postSupport: vi.fn(),
      requestHumanSupport: vi.fn(),
    },
  };
});

function convo(overrides: Partial<SupportConversation> = {}): SupportConversation {
  return {
    id: "conv-1",
    channel: "IN_APP",
    status: "OPEN",
    subject: "Access code help",
    messages: [
      { id: "m1", sender: "USER", body: "My code isn't working" },
      { id: "m2", sender: "AI", body: "Let me check that for you." },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listSupport).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SupportWidget", () => {
  it("resumes the latest unresolved conversation when opened", async () => {
    vi.mocked(api.listSupport).mockResolvedValue([
      { id: "conv-1", channel: "IN_APP", status: "NEEDS_HUMAN", subject: "Access code help" },
    ]);
    vi.mocked(api.getSupport).mockResolvedValue(convo({ status: "NEEDS_HUMAN" }));

    render(<SupportWidget />);
    await userEvent.click(screen.getByRole("button", { name: /open support chat/i }));

    // The previous thread (including the team-visible handoff status) is restored.
    expect(await screen.findByText("My code isn't working")).toBeInTheDocument();
    expect(screen.getByText(/a team member will reply/i)).toBeInTheDocument();
    expect(api.getSupport).toHaveBeenCalledWith("conv-1");
  });

  it("skips resolved conversations when resuming", async () => {
    vi.mocked(api.listSupport).mockResolvedValue([
      { id: "conv-9", channel: "IN_APP", status: "RESOLVED", subject: "Old thread" },
    ]);

    render(<SupportWidget />);
    await userEvent.click(screen.getByRole("button", { name: /open support chat/i }));

    await waitFor(() => expect(api.listSupport).toHaveBeenCalled());
    expect(api.getSupport).not.toHaveBeenCalled();
    // Fresh-start greeting shows instead.
    expect(screen.getByText(/ask about access codes/i)).toBeInTheDocument();
  });

  it("polls the open conversation so agent replies appear without sending", async () => {
    vi.mocked(api.listSupport).mockResolvedValue([
      { id: "conv-1", channel: "IN_APP", status: "NEEDS_HUMAN", subject: "Access code help" },
    ]);
    vi.mocked(api.getSupport).mockResolvedValue(convo({ status: "NEEDS_HUMAN" }));

    render(<SupportWidget />);
    await userEvent.click(screen.getByRole("button", { name: /open support chat/i }));
    await screen.findByText("My code isn't working");

    // Next poll returns the thread WITH the agent's reply.
    vi.mocked(api.getSupport).mockResolvedValue(
      convo({
        status: "NEEDS_HUMAN",
        messages: [
          { id: "m1", sender: "USER", body: "My code isn't working" },
          { id: "m2", sender: "AI", body: "Let me check that for you." },
          { id: "m3", sender: "AGENT", body: "Fixed — try it now." },
        ],
      }),
    );

    // The widget polls every few seconds; the reply must arrive on its own.
    expect(await screen.findByText("Fixed — try it now.", undefined, { timeout: 6000 })).toBeInTheDocument();
  }, 10_000);

  it("shows the message optimistically while the send is in flight", async () => {
    let resolveSend: (c: SupportConversation) => void = () => {};
    vi.mocked(api.startSupport).mockImplementation(
      () => new Promise<SupportConversation>((res) => { resolveSend = res; }),
    );

    render(<SupportWidget />);
    await userEvent.click(screen.getByRole("button", { name: /open support chat/i }));
    await userEvent.type(screen.getByLabelText("Message"), "Hello there");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // Echoed immediately, before the server round-trip completes.
    expect(screen.getByText("Hello there")).toBeInTheDocument();

    await act(async () => {
      resolveSend(convo({ messages: [{ id: "m1", sender: "USER", body: "Hello there" }] }));
    });
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("restores the draft when the send fails", async () => {
    vi.mocked(api.startSupport).mockRejectedValue(new Error("network down"));

    render(<SupportWidget />);
    await userEvent.click(screen.getByRole("button", { name: /open support chat/i }));
    await userEvent.type(screen.getByLabelText("Message"), "Please help");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
    expect(screen.getByLabelText("Message")).toHaveValue("Please help");
  });
});
