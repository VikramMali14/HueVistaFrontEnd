// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AiCreditSummary, CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";
import { NavBalance } from "../nav-balance";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

vi.mock("@/lib/api", () => ({
  api: {
    getMyEntitlement: vi.fn(),
    getProjectPurchaseOptions: vi.fn(),
    getAiCredits: vi.fn(),
  },
}));

function entitlement(over: Partial<CustomerEntitlement> = {}): CustomerEntitlement {
  return {
    customerId: "c-1",
    customerName: "Priya Sharma",
    accessExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    expired: false,
    projectAllowance: 3,
    projectsCreated: 1,
    projectsRemaining: 2,
    ...over,
  };
}

function options(availableCredits: number): ProjectPurchaseOptions {
  return {
    subscribed: false,
    pricingPlan: "FREE",
    projectPricePoints: 80,
    projectPricePaise: 14900,
    reopenPricePoints: 9,
    reopenPricePaise: 900,
    pointsBalance: 0,
    pointsEligible: false,
    validDays: 365,
    availableCredits,
  };
}

function wallet(over: Partial<AiCreditSummary> = {}): AiCreditSummary {
  return {
    balance: 4,
    eligible: true,
    pricePaise: 9900,
    listPricePaise: 19800,
    discountPercent: 50,
    minPurchase: 1,
    maxPurchase: 50,
    renderCost: 1,
    currency: "INR",
    recentActivity: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NavBalance", () => {
  /**
   * The sum is the point. A shop's assigned allowance and projects the customer bought
   * are both spendable and both count, and showing only one of them tells somebody who
   * has just paid that nothing arrived.
   */
  it("adds a live shop allowance to projects the account bought", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(entitlement());
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(3));
    vi.mocked(api.getAiCredits).mockResolvedValue(wallet());

    render(<NavBalance />);

    expect(await screen.findByText("5")).toBeInTheDocument(); // 2 on the code + 3 bought
    expect(screen.getByText("projects")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("credits")).toBeInTheDocument();
  });

  /** A lapsed window's remaining allowance is not spendable, so it must not be counted. */
  it("ignores the allowance on an expired entitlement", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(entitlement({ expired: true }));
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(1));
    vi.mocked(api.getAiCredits).mockResolvedValue(wallet({ balance: 0 }));

    render(<NavBalance />);

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.getByText("project")).toBeInTheDocument(); // singular
  });

  /**
   * An account that can never hold a credit is shown no credit figure. A number that can
   * only ever read 0 is a question the navbar keeps asking and never answers.
   */
  it("hides the credit figure for an account that cannot hold credits", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(null);
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(2));
    vi.mocked(api.getAiCredits).mockResolvedValue(wallet({ eligible: false, balance: 0 }));

    render(<NavBalance />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.queryByText("credits")).not.toBeInTheDocument();
  });

  /**
   * Nothing at all rather than zeros. "0 projects" on an account holding five is worse
   * than an empty corner of the navbar, and a failed fetch is exactly how that happens.
   */
  it("renders nothing when every request fails", async () => {
    vi.mocked(api.getMyEntitlement).mockRejectedValue(new Error("offline"));
    vi.mocked(api.getProjectPurchaseOptions).mockRejectedValue(new Error("offline"));
    vi.mocked(api.getAiCredits).mockRejectedValue(new Error("offline"));

    const { container } = render(<NavBalance />);

    await vi.waitFor(() => expect(api.getAiCredits).toHaveBeenCalled());
    expect(container.querySelector("a")).toBeNull();
  });

  /**
   * One rail failing says nothing about the other. A wallet that will not load must not
   * blank a project count that arrived perfectly well.
   */
  it("still shows projects when the wallet alone fails", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(entitlement());
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(0));
    vi.mocked(api.getAiCredits).mockRejectedValue(new Error("wallet down"));

    render(<NavBalance />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.queryByText("credits")).not.toBeInTheDocument();
  });

  it("links to the page that explains and sells both", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(null);
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(1));
    vi.mocked(api.getAiCredits).mockResolvedValue(wallet());

    render(<NavBalance />);

    expect(await screen.findByRole("link")).toHaveAttribute("href", "/my-projects");
  });
});
