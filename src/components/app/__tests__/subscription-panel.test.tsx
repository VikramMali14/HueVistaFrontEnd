// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanOption, SubscriptionSummary } from "@/lib/types";
import { SubscriptionPanel } from "../subscription-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/lib/payments", () => ({
  subscribeToPlan: vi.fn(),
  buyPoints: vi.fn(),
}));

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
      // Points are shop-side; a rejection here is the normal path for this panel.
      getRewardPoints: vi.fn().mockRejectedValue(new Error("403")),
      getCurrentSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      resumeSubscription: vi.fn(),
      pointsPayImageCredit: vi.fn(),
      pointsPayAutoMaskCredit: vi.fn(),
      pointsPayProjectCredit: vi.fn(),
    },
  };
});

const DAYS = 86_400_000;

const STARTER: PlanOption = {
  plan: "STARTER", displayName: "Starter", rank: 1,
  priceInPaise: 99900, priceInRupees: 999, taxPercent: 0,
  priceWithTaxInPaise: 99900, priceWithTaxInRupees: 999,
  monthlyAiLimit: 20, monthlyImageLimit: 20, monthlyAutoMaskLimit: 5,
  pdfImageLimit: 4, monthlyPdfLimit: 25,
  imageOveragePriceInPaise: 5000, imageOveragePriceWithTaxInPaise: 5000,
  autoMaskOveragePriceInPaise: 2500, autoMaskOveragePriceWithTaxInPaise: 2500,
};

const PROFESSIONAL: PlanOption = {
  plan: "PROFESSIONAL", displayName: "Professional", rank: 2,
  priceInPaise: 249900, priceInRupees: 2499, taxPercent: 0,
  priceWithTaxInPaise: 249900, priceWithTaxInRupees: 2499,
  monthlyAiLimit: 60, monthlyImageLimit: 60, monthlyAutoMaskLimit: 40,
  pdfImageLimit: 8, monthlyPdfLimit: 100,
  imageOveragePriceInPaise: 5000, imageOveragePriceWithTaxInPaise: 5000,
  autoMaskOveragePriceInPaise: 2500, autoMaskOveragePriceWithTaxInPaise: 2500,
};

const PLANS: PlanOption[] = [STARTER, PROFESSIONAL];

function sub(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: "sub-1",
    plan: "STARTER",
    planDisplayName: "Starter",
    status: "ACTIVE",
    trial: false,
    currentPeriodStart: new Date(Date.now() - 5 * DAYS).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 25 * DAYS).toISOString(),
    aiGenerationsUsed: 3,
    aiGenerationsLimit: 20,
    aiGenerationsRemaining: 17,
    ...overrides,
  };
}

const panel = (s: SubscriptionSummary | null) =>
  render(<SubscriptionPanel initialSubscription={s} history={[]} plans={PLANS} />);

describe("SubscriptionPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The backend gate counts a CANCELLED plan inside its paid period as entitling. The
   * panel must agree, or it tells a shop its subscription has ended while every feature
   * still works.
   */
  it("shows a cancelled-but-still-paid-for plan as usable, not ended", () => {
    panel(sub({ status: "CANCELLED" }));
    expect(screen.getByText(/active till period end/i)).toBeTruthy();
    expect(screen.queryByText(/subscription has ended/i)).toBeNull();
    // Usage is still worth showing — those images are still spendable.
    expect(screen.getByText(/3 of 20 used/i)).toBeTruthy();
  });

  it("shows a lapsed plan as ended with a way back", () => {
    panel(sub({
      status: "CANCELLED",
      currentPeriodEnd: new Date(Date.now() - 1 * DAYS).toISOString(),
    }));
    expect(screen.getByText(/subscription has ended/i)).toBeTruthy();
    // Every tier is buyable again — nothing is "current", so nothing is blocked.
    expect(screen.getAllByRole("button", { name: /renew with this plan/i })).toHaveLength(PLANS.length);
  });

  /**
   * Razorpay has no "un-cancel" for a paid plan, so the backend can only ever answer
   * that resume request with an error. Offering the button was offering a dead end.
   */
  it("offers resume for a trial but not for a paid plan winding down", () => {
    const { unmount } = panel(sub({ trial: true, cancelAtPeriodEnd: true }));
    expect(screen.getByRole("button", { name: /keep my trial running/i })).toBeTruthy();
    unmount();

    panel(sub({ cancelAtPeriodEnd: true }));
    expect(screen.queryByRole("button", { name: /keep my (plan|trial) running/i })).toBeNull();
    // ...and says what actually works instead.
    expect(screen.getByText(/starts the day this one ends/i)).toBeTruthy();
  });

  /** Re-subscribing while winding down is queued, not billed on top. */
  it("tells a winding-down shop that a new plan starts when the current one ends", () => {
    panel(sub({ cancelAtPeriodEnd: true }));
    expect(screen.getByRole("button", { name: /continue with starter/i })).toBeTruthy();
    expect(screen.getAllByText(/no double billing/i).length).toBeGreaterThan(0);
  });

  /** A plan bought to start later is not in force yet — it must not read as active. */
  it("labels a not-yet-started plan with its start date instead of active", () => {
    panel(sub({
      currentPeriodStart: new Date(Date.now() + 12 * DAYS).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 42 * DAYS).toISOString(),
    }));
    expect(screen.getByText(/^Starts /)).toBeTruthy();
    expect(screen.queryByText(/3 of 20 used/i)).toBeNull();
  });

  /** Upgrade vs downgrade comes from the rank the server serves, not a local copy. */
  it("uses the server-supplied tier rank to allow upgrades and block downgrades", () => {
    // On Professional (rank 2), Starter (rank 1) is a downgrade and must be blocked.
    panel(sub({ plan: "PROFESSIONAL", planDisplayName: "Professional" }));
    expect(screen.getByRole("button", { name: "Current plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel current plan first" })).toBeTruthy();
  });

  /**
   * And the SERVED rank is what decides — proven by serving an order the hard-coded
   * fallback disagrees with. Getting this from the API is the point: a local copy of the
   * tier ladder goes quietly wrong the day a tier is added or reordered on the server.
   */
  it("follows the served ranks even when they contradict the built-in order", () => {
    const reordered: PlanOption[] = [
      { ...STARTER, rank: 9 },       // Starter, served as the TOP tier
      { ...PROFESSIONAL, rank: 0 },  // Professional, served as the bottom
    ];
    render(
      <SubscriptionPanel
        initialSubscription={sub({ plan: "PROFESSIONAL", planDisplayName: "Professional" })}
        history={[]}
        plans={reordered}
      />,
    );
    // Starter now outranks Professional, so it reads as the upgrade, not a downgrade.
    expect(screen.getByRole("button", { name: /upgrade to starter/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel current plan first" })).toBeNull();
  });
});
