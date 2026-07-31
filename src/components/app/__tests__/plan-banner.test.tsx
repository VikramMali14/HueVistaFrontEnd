// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { SubscriptionSummary } from "@/lib/types";
import { PlanBanner } from "../plan-banner";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getCurrentSubscription: vi.fn(),
    getProjectPurchaseOptions: vi.fn().mockRejectedValue(new Error("no options")),
    pointsPayProjectCredit: vi.fn(),
  },
}));

const DAYS = 86_400_000;

function sub(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: "sub-1",
    plan: "STARTER",
    planDisplayName: "Starter",
    status: "ACTIVE",
    trial: false,
    currentPeriodStart: new Date(Date.now() - 5 * DAYS).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 25 * DAYS).toISOString(),
    projectsUsed: 4,
    projectsLimit: 15,
    projectsRemaining: 11,
    ...overrides,
  };
}

async function banner(s: SubscriptionSummary) {
  vi.mocked(api.getCurrentSubscription).mockResolvedValue(s);
  const view = render(<PlanBanner />);
  await waitFor(() => expect(api.getCurrentSubscription).toHaveBeenCalled());
  return view;
}

describe("PlanBanner", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Keying on status === "ACTIVE" left this blank for a cancelled plan: no usage while
   * one was still running, and — once it lapsed — no subscribe prompt at all, at exactly
   * the moment it matters most.
   */
  it("keeps showing usage for a cancelled plan inside its paid period", async () => {
    await banner(sub({ status: "CANCELLED" }));
    await waitFor(() => expect(screen.getByText(/4\/15 projects this month/i)).toBeTruthy());
    // Not renewing, so the countdown and the way back are both worth showing.
    expect(screen.getByText(/days left/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /subscribe/i })).toBeTruthy();
  });

  it("prompts to subscribe once a cancelled plan has lapsed", async () => {
    await banner(sub({
      status: "CANCELLED",
      currentPeriodEnd: new Date(Date.now() - 1 * DAYS).toISOString(),
    }));
    await waitFor(() => expect(screen.getByText(/view-only/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /subscribe/i })).toBeTruthy();
  });

  /** A plan bought to start later isn't in force — the old one's banner is the true one. */
  it("stays out of the way for a plan that has not started yet", async () => {
    const { container } = await banner(sub({
      currentPeriodStart: new Date(Date.now() + 10 * DAYS).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 40 * DAYS).toISOString(),
    }));
    await waitFor(() => expect(container).toBeTruthy());
    expect(container.textContent).toBe("");
  });

  it("shows a live paid plan without a cancellation countdown", async () => {
    await banner(sub());
    await waitFor(() => expect(screen.getByText(/Starter plan/i)).toBeTruthy());
    expect(screen.getByText(/^active$/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /subscribe/i })).toBeNull();
  });
});
