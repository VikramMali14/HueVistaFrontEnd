// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ProjectPurchaseOptions, SubscriptionSummary } from "@/lib/types";
import { AssignableProjects } from "../assignable-projects";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getCurrentSubscription: vi.fn(),
    getProjectPurchaseOptions: vi.fn(),
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
    projectsUsed: 15,
    projectsLimit: 15,
    projectsRemaining: 0,
    ...overrides,
  };
}

function options(overrides: Partial<ProjectPurchaseOptions> = {}): ProjectPurchaseOptions {
  return {
    subscribed: true,
    pricingPlan: "STARTER",
    projectPricePoints: 60,
    projectPricePaise: 6500,
    reopenPricePoints: 9,
    reopenPricePaise: 1000,
    pointsBalance: 0,
    validDays: 30,
    availableCredits: 0,
    ...overrides,
  };
}

async function show(s: SubscriptionSummary | null, o: ProjectPurchaseOptions | null) {
  vi.mocked(api.getCurrentSubscription).mockImplementation(
    s ? async () => s : async () => { throw new Error("404"); },
  );
  vi.mocked(api.getProjectPurchaseOptions).mockImplementation(
    o ? async () => o : async () => { throw new Error("404"); },
  );
  const view = render(<AssignableProjects />);
  await waitFor(() => expect(api.getCurrentSubscription).toHaveBeenCalled());
  return view;
}

describe("AssignableProjects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts the month's allowance less what is spent or already held", async () => {
    await show(sub({ projectsUsed: 9, reservedProjects: 2 }), options());
    expect(await screen.findByText(/^4 projects available to assign$/)).toBeTruthy();
  });

  /**
   * The whole point of showing this: a shop that had spent its month but bought three
   * extras read "not enough quota" as "I have to upgrade", because nothing on the grant
   * screens ever mentioned the extras it had already paid for.
   */
  it("counts bought extras, wherever they are sitting", async () => {
    // Two added to the plan, one still standalone from a spell between plans — the
    // backend pulls that one across when an assignment needs it, so it counts here.
    await show(sub({ purchasedProjectCredits: 2 }), options({ availableCredits: 1 }));
    expect(await screen.findByText(/^3 projects available to assign · includes 3 you bought/))
      .toBeTruthy();
  });

  it("names the studio when there is nothing left to give", async () => {
    await show(sub(), options());
    expect(await screen.findByText(/Buy another project in the studio/i)).toBeTruthy();
    expect(screen.getByText(/stays\s+open for 30 days/i)).toBeTruthy();
  });

  /** Without a plan there is nothing to assign against, and nothing worth saying. */
  it("renders nothing for an account with no subscription", async () => {
    const { container } = await show(null, options());
    await waitFor(() => expect(api.getProjectPurchaseOptions).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
