// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";
import { CustomerProjectsPanel } from "../customer-projects-panel";
import { api } from "@/lib/api";

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
      getMyEntitlement: vi.fn(),
      getProjectPurchaseOptions: vi.fn(),
      requestMoreProjects: vi.fn(),
    },
  };
});

/** A shop's customer whose assigned allowance is completely used up. */
const CODE_EXHAUSTED: CustomerEntitlement = {
  customerId: "c-1",
  customerName: "Priya Sharma",
  accessExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  expired: false,
  projectAllowance: 2,
  projectsCreated: 2,
  projectsRemaining: 0,
};

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CustomerProjectsPanel — a customer who has both a shop and a receipt", () => {
  /**
   * The bug this panel had: a shop-onboarded customer's BOUGHT projects were invisible.
   *
   * The panel branched as though "a shop assigned you projects" and "you bought
   * projects" were mutually exclusive kinds of customer. Nothing enforces that — the
   * cart on this very page sells to anybody, and the person most likely to use it is
   * exactly the one whose shop allowance has just run out. So somebody could pay, land
   * back here, and be told they had used every project they had.
   */
  it("counts projects it bought on top of a used-up shop allowance", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(CODE_EXHAUSTED);
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(2));

    render(<CustomerProjectsPanel showBuy={false} />);

    // Scoped to the headline figure: the breakdown below it now carries a "2" of
    // its own (the projects bought), so a bare getByText("2") matches both.
    const unit = await screen.findByText("ready to use");
    await waitFor(() => expect(unit.closest("p")).toHaveTextContent("2"));
    // Broken down rather than folded together: the two came from different places.
    // The breakdown is a labelled row now, so the label and its value are asserted
    // together — "2" alone also matches the headline figure directly above it.
    expect(screen.getByText("You bought").closest("div")).toHaveTextContent("2");
    // And the dead end is gone — there is something to spend, so the panel says so.
    expect(screen.getByRole("link", { name: /Start one/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask my shop/ })).not.toBeInTheDocument();
  });

  /** With nothing bought, the shop route is still the right and only answer. */
  it("still points at the shop when the code is used up and nothing was bought", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue(CODE_EXHAUSTED);
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(0));

    render(<CustomerProjectsPanel showBuy={false} />);

    expect(await screen.findByText(/used every project on your code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ask my shop/ })).toBeInTheDocument();
  });

  /**
   * An expired window takes the SHOP's allowance with it, and nothing else. Credits the
   * customer paid for carry their own validity and outlive the code — which is why the
   * two cannot simply be added up before the window is checked.
   */
  it("drops the shop allowance when the window closes but keeps what was bought", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue({
      ...CODE_EXHAUSTED,
      expired: true,
      projectsCreated: 1,
      projectsRemaining: 1,
    });
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(3));

    render(<CustomerProjectsPanel showBuy={false} />);

    // Three, not four: the one left on the lapsed code is not spendable.
    const figure = await screen.findByText("ready to use");
    await waitFor(() => expect(figure.closest("p")).toHaveTextContent("3"));
    expect(screen.getByText("Access").closest("div")).toHaveTextContent("Closed");
    // …and the body says what survives the closure, without repeating that it closed.
    expect(screen.getByText(/yours to keep either way/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start one/ })).toBeInTheDocument();
  });

  it("sends an expired customer holding nothing back to the shop for a code", async () => {
    vi.mocked(api.getMyEntitlement).mockResolvedValue({ ...CODE_EXHAUSTED, expired: true });
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue(options(0));

    render(<CustomerProjectsPanel showBuy={false} />);

    expect(await screen.findByRole("link", { name: /unlock with it here/ })).toBeInTheDocument();
  });
});
