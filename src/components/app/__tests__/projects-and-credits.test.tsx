// @vitest-environment jsdom
/**
 * The order of the customer's billing page.
 *
 * The counter that SELLS used to sit third, under the two that COUNT, on the reasoning
 * that somebody arriving here answers "what do I have" before "what do I want". That is
 * true of a first visit and of almost no other: every route into this page — the "buy
 * another project" link in the studio, an empty balance, a room that has run out — is
 * somebody who has already answered the first question. Two full-width cards of counting
 * above the thing they came to do is a shop that makes you walk past the stockroom to
 * reach the till.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { AiCreditSummary, CartCatalogue, ProjectPurchaseOptions } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  HttpError: class extends Error {},
  api: {
    getCart: vi.fn(),
    getMyEntitlement: vi.fn(),
    getProjectPurchaseOptions: vi.fn(),
    getAiCredits: vi.fn(),
    requestMoreProjects: vi.fn(),
  },
}));
vi.mock("@/lib/payments", () => ({
  checkoutCart: vi.fn(),
  buyOneProject: vi.fn(),
  buyAiCredits: vi.fn(),
  PaymentVerificationError: class extends Error {},
}));

import { ProjectsAndCredits } from "../projects-and-credits";
import { api as realApi } from "@/lib/api";

const api = vi.mocked(realApi);

const CART: CartCatalogue = {
  eligible: true,
  projectPricePaise: 14900,
  creditPricePaise: 7000,
  comboPricePaise: 19900,
  comboProjects: 1,
  comboCredits: 1,
  bundleAvailable: true,
  bundlePricePaise: 43800,
  bundleListPricePaise: 65700,
  bundleProjects: 3,
  bundleCredits: 3,
  validDays: 365,
  maxQuantity: 20,
  offers: [{ code: "HUE10", minSubtotalPaise: 28900, percentOff: 10 }],
  availableProjects: 2,
  creditBalance: 4,
  currency: "INR",
};

const OPTIONS: ProjectPurchaseOptions = {
  subscribed: false,
  pricingPlan: "FREE",
  projectPricePoints: 80,
  projectPricePaise: 14900,
  reopenPricePoints: 9,
  reopenPricePaise: 900,
  pointsBalance: 0,
  pointsEligible: false,
  validDays: 365,
  availableCredits: 2,
};

const WALLET: AiCreditSummary = {
  eligible: true,
  balance: 4,
  pricePaise: 7000,
  listPricePaise: 7000,
  discountPercent: 0,
  minPurchase: 1,
  maxPurchase: 20,
  renderCost: 1,
  currency: "INR",
  recentActivity: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getCart.mockResolvedValue(CART);
  // No shop behind this account — the branch a self-signed-up customer gets.
  api.getMyEntitlement.mockResolvedValue(null);
  api.getProjectPurchaseOptions.mockResolvedValue(OPTIONS);
  api.getAiCredits.mockResolvedValue(WALLET);
});

describe("ProjectsAndCredits", () => {
  it("puts the counter that sells above the two that count", async () => {
    render(<ProjectsAndCredits />);

    const till = await screen.findByRole("heading", { name: "Buy projects & credits" });
    const projects = await screen.findByText("Your projects");

    expect(till.compareDocumentPosition(projects)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("still shows both balances, below the till rather than instead of it", async () => {
    render(<ProjectsAndCredits />);

    await screen.findByRole("heading", { name: "Buy projects & credits" });
    expect(await screen.findByText("Your projects")).toBeInTheDocument();
    await waitFor(() => expect(api.getAiCredits).toHaveBeenCalled());
  });

  it("sells from one place only, so no project is priced twice on one screen", async () => {
    // The balances count and never sell — the cart above is the whole counter. Two ways to
    // buy the same project on one page is how somebody ends up with two prices in front of
    // them and no idea which applies.
    render(<ProjectsAndCredits />);

    await screen.findByRole("heading", { name: "Buy projects & credits" });
    expect(screen.queryByRole("button", { name: /^Buy a project/ })).not.toBeInTheDocument();
  });
});
