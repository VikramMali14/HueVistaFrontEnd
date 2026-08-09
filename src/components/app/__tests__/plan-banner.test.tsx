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
    await waitFor(() => expect(screen.getByText("4 of 15")).toBeTruthy());
    expect(screen.getByText(/projects this month/i)).toBeTruthy();
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
    expect(screen.getByText("4 of 15")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /subscribe/i })).toBeNull();
  });

  /**
   * The fraction is the ALLOWANCE, so on its own it read as capacity the shop does not
   * have: 15-project plan, 3 used, 10 held behind codes nobody has redeemed → "3/15",
   * while the portal would assign 2 and creation refuses after 5. The holds have to be
   * named for the banner to be honest about the month.
   */
  it("names projects held behind unused codes", async () => {
    await banner(sub({ projectsUsed: 3, reservedProjects: 10, projectsRemaining: 2 }));
    await waitFor(() => expect(screen.getByText("3 of 15")).toBeTruthy());
    // Each figure is a labelled chip now, not one monospace run-on.
    expect(screen.getByText(/held for codes/i)).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText(/not used yet/i)).toBeTruthy();
  });

  /** Nothing held, nothing said — the chip is for a real state, not a permanent zero. */
  it("says nothing about holds when there are none", async () => {
    await banner(sub());
    await waitFor(() => expect(screen.getByText("4 of 15")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("40 of ∞")).toBeTruthy());
    // An unlimited allowance has no sum to spell out, so no derivation line.
    expect(screen.queryByText(/= ∞/)).toBeNull();
  });

  /**
   * The strip said "0/32 projects this month" while the pricing page said Starter
   * includes 15. Both true — 32 is 15 plus 17 carried over from a replaced plan —
   * but with nothing on screen to reconcile them, the two pages just disagreed.
   */
  it("spells out where an allowance bigger than the plan came from", async () => {
    await banner(sub({ projectsUsed: 0, projectsLimit: 15, carriedProjectCredits: 17 }));
    await waitFor(() => expect(screen.getByText("0 of 32")).toBeTruthy());
    expect(screen.getByText("15 this month + 17 carried over = 32")).toBeTruthy();
  });

  /** Nothing to reconcile when the total IS the plan's own number. */
  it("says nothing about the sum when the allowance is just the plan", async () => {
    await banner(sub());
    await waitFor(() => expect(screen.getByText("4 of 15")).toBeTruthy());
    expect(screen.queryByText(/this month \+/)).toBeNull();
  });

  /**
   * The free plan's period end is a RENEWAL, not a deadline.
   *
   * Rendering it as "3 days left" beside a subscribe nudge would put the seven-day
   * trial's framing back on a plan that has no end — the exact impression the tier was
   * changed to stop giving.
   */
  it("counts the free plan UP to its renewal rather than down to an ending", async () => {
    await banner(sub({
      plan: "FREE",
      planDisplayName: "Free",
      projectsUsed: 1,
      projectsLimit: 2,
      projectsRemaining: 1,
    }));
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeTruthy());
    expect(screen.getByText(/renews in 25 days/i)).toBeTruthy();
    expect(screen.queryByText(/days left/i)).toBeNull();
  });

  /** The upgrade prompt waits until the month is actually spent — offering it against an
   *  untouched allowance is selling to someone who has not yet hit the limit. */
  it("only nudges a free shop to subscribe once the month is spent", async () => {
    await banner(sub({
      plan: "FREE", planDisplayName: "Free",
      projectsUsed: 0, projectsLimit: 2, projectsRemaining: 2,
    }));
    await waitFor(() => expect(screen.getByText("0 of 2")).toBeTruthy());
    expect(screen.queryByRole("link", { name: /subscribe/i })).toBeNull();
  });

  it("nudges a free shop once nothing is left this month", async () => {
    await banner(sub({
      plan: "FREE", planDisplayName: "Free",
      projectsUsed: 2, projectsLimit: 2, projectsRemaining: 0,
    }));
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeTruthy());
    expect(screen.getByRole("link", { name: /subscribe/i })).toBeTruthy();
  });
});
