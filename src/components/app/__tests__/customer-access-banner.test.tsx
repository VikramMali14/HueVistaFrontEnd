// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";
import { CustomerAccessBanner } from "../customer-access-banner";
import { api } from "@/lib/api";
import { buyOneProject } from "@/lib/payments";

vi.mock("@/lib/api", () => ({
  api: {
    getMyEntitlement: vi.fn(),
    getProjectPurchaseOptions: vi.fn(),
  },
}));

vi.mock("@/lib/payments", () => ({ buyOneProject: vi.fn() }));

const DAYS = 86_400_000;

function options(overrides: Partial<ProjectPurchaseOptions> = {}): ProjectPurchaseOptions {
  return {
    subscribed: false,
    pricingPlan: "FREE",
    projectPricePoints: 80,
    projectPricePaise: 9900,
    reopenPricePoints: 9,
    reopenPricePaise: 1000,
    pointsBalance: 0,
    // Points are a shop currency — this banner only ever renders for a CUSTOMER.
    pointsEligible: false,
    validDays: 30,
    availableCredits: 0,
    ...overrides,
  };
}

function entitlement(overrides: Partial<CustomerEntitlement> = {}): CustomerEntitlement {
  return {
    customerId: "cust-1",
    customerName: "Anjali",
    retailerOrgId: "org-1",
    accessExpiresAt: new Date(Date.now() + 6 * DAYS).toISOString(),
    expired: false,
    projectAllowance: 3,
    projectsCreated: 1,
    projectsRemaining: 2,
    ...overrides,
  };
}

async function banner(ent: CustomerEntitlement | null, opts = options()) {
  vi.mocked(api.getMyEntitlement).mockResolvedValue(ent);
  vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(opts);
  const view = render(<CustomerAccessBanner />);
  await waitFor(() => expect(api.getMyEntitlement).toHaveBeenCalled());
  return view;
}

describe("CustomerAccessBanner", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The account this whole flow exists for: signed up on its own, no code, no shop.
   * It used to be told to ask a paint shop it does not have, which is not an instruction
   * anyone can follow — the purchase is the one door it has, so it has to be on screen.
   */
  it("offers the purchase to an account with no shop behind it", async () => {
    await banner(null);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /buy a project/i })).toBeTruthy(),
    );
    // The price is the server's, not a constant in the UI.
    expect(screen.getByRole("button", { name: /₹99/ })).toBeTruthy();
    // What the money buys, said before it is spent.
    expect(screen.getByText(/stays open for 30 days/i)).toBeTruthy();
    // The code stays offered too — someone may have walked into a shop since.
    expect(screen.getByRole("link", { name: /redeem a code/i })).toBeTruthy();
  });

  /** A paid-for project that has not been used is a reason to start, not to buy again. */
  it("points an unused credit at the studio instead of selling a second one", async () => {
    await banner(null, options({ availableCredits: 1 }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /start a project/i })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /buy a project/i })).toBeNull();
    expect(screen.getByText(/1 project paid for and ready/i)).toBeTruthy();
  });

  /** A bought credit lands in the banner without a reload — the buy resolves the options. */
  it("switches to 'ready to start' once the purchase completes", async () => {
    vi.mocked(buyOneProject).mockResolvedValue(options({ availableCredits: 1 }));
    await banner(null);

    await userEvent.click(await screen.findByRole("button", { name: /buy a project/i }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /start a project/i })).toBeTruthy(),
    );
  });

  /** Closing Checkout is a change of mind, not a failure: the offer stays, no error shows. */
  it("leaves the offer alone when the buyer closes checkout", async () => {
    vi.mocked(buyOneProject).mockResolvedValue(null);
    await banner(null);

    await userEvent.click(await screen.findByRole("button", { name: /buy a project/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /buy a project/i })).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a payment that actually failed", async () => {
    vi.mocked(buyOneProject).mockRejectedValue(new Error("Card was declined."));
    await banner(null);

    await userEvent.click(await screen.findByRole("button", { name: /buy a project/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Card was declined."));
  });

  /**
   * A shop-onboarded customer is NOT sold projects direct: theirs were assigned and paid
   * for out of the shop's quota, and the shop adds another in a click. Offering a
   * checkout here would charge for something the counter already covers.
   */
  it("never offers the purchase to a customer a shop manages", async () => {
    await banner(entitlement());

    await waitFor(() => expect(screen.getByText(/1 of 3 projects used/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /buy a project/i })).toBeNull();
  });

  it("never offers the purchase when a shop code has merely expired", async () => {
    await banner(entitlement({ expired: true, projectsRemaining: 0 }));

    await waitFor(() => expect(screen.getByText(/access ended/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /buy a project/i })).toBeNull();
    expect(screen.getByRole("link", { name: /redeem a code/i })).toBeTruthy();
  });

  /** Best-effort prices: without one there is no button, so the copy must not promise one. */
  it("falls back to the code alone when the price never arrives", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(null);
    vi.mocked(api.getProjectPurchaseOptions).mockRejectedValue(new Error("offline"));
    render(<CustomerAccessBanner />);

    await waitFor(() => expect(screen.getByText(/redeem a code from your paint shop/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /buy a project/i })).toBeNull();
  });
});
