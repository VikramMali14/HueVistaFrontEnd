// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";
import { CustomerAccessBanner } from "../customer-access-banner";
import { api } from "@/lib/api";
import { buyOneProject } from "@/lib/payments";

vi.mock("@/lib/api", () => ({
  api: { getMyEntitlement: vi.fn(), getProjectPurchaseOptions: vi.fn() },
  HttpError: class HttpError extends Error {},
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
    reopenPricePaise: 900,
    pointsBalance: 0,
    validDays: 30,
    availableCredits: 0,
    ...overrides,
  };
}

function entitlement(overrides: Partial<CustomerEntitlement> = {}): CustomerEntitlement {
  return {
    projectAllowance: 3,
    projectsCreated: 1,
    projectsRemaining: 2,
    expired: false,
    accessExpiresAt: new Date(Date.now() + 10 * DAYS).toISOString(),
    ...overrides,
  } as CustomerEntitlement;
}

async function banner(ent: CustomerEntitlement | null, opts: ProjectPurchaseOptions | null = options()) {
  vi.mocked(api.getMyEntitlement).mockResolvedValue(ent);
  if (opts) vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(opts);
  else vi.mocked(api.getProjectPurchaseOptions).mockRejectedValue(new Error("nope"));
  const view = render(<CustomerAccessBanner />);
  await waitFor(() => expect(api.getMyEntitlement).toHaveBeenCalled());
  return view;
}

describe("CustomerAccessBanner", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The account this whole route exists for: signed up by email, nobody behind them.
   * Telling them to "ask your paint shop" named a party they do not have, and left the
   * account with no way forward at all.
   */
  describe("a customer with no shop", () => {
    it("offers to sell them a project, and says how long it lasts", async () => {
      await banner(null);
      expect(await screen.findByRole("button", { name: /buy a project.*₹99/i })).toBeInTheDocument();
      expect(screen.getByText(/stays open for 30 days/i)).toBeInTheDocument();
    });

    it("still offers the code route for someone who was given one", async () => {
      await banner(null);
      expect(screen.getByRole("link", { name: /unlock with a code/i })).toBeInTheDocument();
    });

    it("stops offering the purchase once one is paid for and waiting", async () => {
      await banner(null, options({ availableCredits: 1 }));
      expect(screen.getByText(/1 project paid for and ready/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /buy a project/i })).not.toBeInTheDocument();
    });

    it("shows the new credit after a completed purchase, without a reload", async () => {
      const user = userEvent.setup();
      await banner(null);
      vi.mocked(buyOneProject).mockResolvedValue(options({ availableCredits: 1 }));

      await user.click(await screen.findByRole("button", { name: /buy a project/i }));

      expect(await screen.findByText(/1 project paid for and ready/i)).toBeInTheDocument();
    });

    /** Closing Checkout is a decision, not a failure — it must not raise an error. */
    it("says nothing when the buyer closes the payment window", async () => {
      const user = userEvent.setup();
      await banner(null);
      vi.mocked(buyOneProject).mockResolvedValue(null);

      await user.click(await screen.findByRole("button", { name: /buy a project/i }));

      await waitFor(() => expect(buyOneProject).toHaveBeenCalled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /buy a project/i })).toBeEnabled();
    });

    it("reports a real payment failure", async () => {
      const user = userEvent.setup();
      await banner(null);
      vi.mocked(buyOneProject).mockRejectedValue(new Error("gateway down"));

      await user.click(await screen.findByRole("button", { name: /buy a project/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not start the payment/i);
    });
  });

  /**
   * A customer a shop onboarded must NOT be sold a project: theirs come out of that
   * shop's quota, and the shop adds another in one click. Charging them for something
   * their shop is already responsible for is the thing this split prevents.
   */
  describe("a customer a shop onboarded", () => {
    it("shows their shop allowance and offers no purchase", async () => {
      await banner(entitlement());
      expect(screen.getByText(/1 of 3 projects used/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /buy a project/i })).not.toBeInTheDocument();
    });

    it("points a used-up customer back at their shop, not at a payment form", async () => {
      await banner(entitlement({ projectsCreated: 3, projectsRemaining: 0 }));
      expect(screen.getByRole("link", { name: /unlock with a code/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /buy a project/i })).not.toBeInTheDocument();
    });

    it("explains an expired window", async () => {
      await banner(entitlement({ expired: true }));
      expect(screen.getByText(/access window has closed/i)).toBeInTheDocument();
    });
  });

  it("renders nothing while the entitlement is still unknown", () => {
    vi.mocked(api.getMyEntitlement).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options());
    const { container } = render(<CustomerAccessBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
