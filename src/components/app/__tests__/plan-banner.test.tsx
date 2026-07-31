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

  /**
   * A lapsed shop can still buy a single project — but in the studio, against the upload
   * that needs it, not from a banner it might click while there is nothing to spend it on.
   */
  it("points a lapsed shop at the studio instead of selling a project here", async () => {
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue({
      subscribed: false,
      pricingPlan: "FREE",
      projectPricePoints: 80,
      projectPricePaise: 9900,
      reopenPricePoints: 9,
      reopenPricePaise: 1000,
      pointsBalance: 500,
      validDays: 30,
      availableCredits: 0,
    });
    await banner(sub({
      status: "CANCELLED",
      currentPeriodEnd: new Date(Date.now() - 1 * DAYS).toISOString(),
    }));
    await waitFor(() =>
      expect(screen.getByText(/add a photo in the studio to buy a single project/i)).toBeTruthy(),
    );
    expect(screen.getByText(/open 30 days from purchase/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /buy a project/i })).toBeNull();
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

  /**
   * The fraction is the ALLOWANCE, so on its own it read as capacity the shop does not
   * have: 15-project plan, 3 used, 10 held behind codes nobody has redeemed → "3/15",
   * while the portal would assign 2 and creation refuses after 5. The holds have to be
   * named for the banner to be honest about the month.
   */
  it("names projects held behind unredeemed codes", async () => {
    await banner(sub({ projectsUsed: 3, reservedProjects: 10, projectsRemaining: 2 }));
    await waitFor(() => expect(screen.getByText(/3\/15 projects this month/i)).toBeTruthy());
    expect(screen.getByText(/10 held for codes not yet redeemed/i)).toBeTruthy();
  });

  /** Nothing held, nothing said — the chip is for a real state, not a permanent zero. */
  it("says nothing about holds when there are none", async () => {
    await banner(sub());
    await waitFor(() => expect(screen.getByText(/4\/15 projects this month/i)).toBeTruthy());
    expect(screen.queryByText(/held for codes/i)).toBeNull();
  });

  /** An unlimited tier has no number worth printing, whichever sentinel the API sends. */
  it("renders an unlimited plan as ∞ rather than ten digits", async () => {
    await banner(sub({
      plan: "ENTERPRISE",
      planDisplayName: "Enterprise",
      projectsUsed: 40,
      projectsLimit: 2147483647,
      projectsRemaining: 2147483647,
      purchasedProjectCredits: 5,
    }));
    await waitFor(() => expect(screen.getByText(/40\/∞ projects this month/i)).toBeTruthy());
  });
});
