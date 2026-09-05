// @vitest-environment jsdom
/**
 * The order of the customer's billing page: what you hold, what it made, then the shop.
 *
 * This has been round both ways. The till was moved to the top on the reasoning that
 * every route in — the studio's "buy another project" link, an empty balance, a room
 * that ran out — is somebody who has already answered "what do I have". But the page is
 * also what the navbar's own balance links to, it is titled "Projects & credits", and
 * following a buy link does not stop anybody wanting to know where they stand. What that
 * order actually produced was a 1,400px price list with four boxed options ahead of the
 * two figures the page exists to report, and on a phone the shop ran for two full screens
 * before the account appeared at all.
 *
 * So: the balances first, the pictures those credits bought second, the counter last.
 * Nothing was removed — the page answers before it asks.
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
    // The pictures those credits bought now sit between the balances and the till.
    listMyRenders: vi.fn(),
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
  api.listMyRenders.mockResolvedValue([]);
});

describe("ProjectsAndCredits", () => {
  it("counts what the account holds before it sells anything", async () => {
    render(<ProjectsAndCredits />);

    const till = await screen.findByRole("heading", { name: "Buy projects & credits" });
    const projects = await screen.findByText("Your projects");

    expect(projects.compareDocumentPosition(till)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("still shows the till, below both balances rather than instead of them", async () => {
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
