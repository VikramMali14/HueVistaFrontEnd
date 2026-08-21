// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", () => ({ api: { getCart: vi.fn() } }));
vi.mock("@/lib/payments", () => ({
  checkoutCart: vi.fn(),
  PaymentVerificationError: class extends Error {},
}));

import { CreditsCart } from "../credits-cart";
import { api as realApi } from "@/lib/api";
import { checkoutCart as realCheckout } from "@/lib/payments";
import type { CartCatalogue } from "@/lib/types";

const api = vi.mocked(realApi);
const checkoutCart = vi.mocked(realCheckout);

/**
 * The counter as the server serves it: ₹149 a project, ₹70 a credit, ₹199 the combo, and
 * the special offer at ₹438 for what would cost ₹657 line by line.
 */
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
  offers: [
    { code: "HUE10", minSubtotalPaise: 28900, percentOff: 10 },
    { code: "HUE20", minSubtotalPaise: 58900, percentOff: 20 },
    { code: "HUE25", minSubtotalPaise: 98900, percentOff: 25 },
  ],
  availableProjects: 0,
  creditBalance: 0,
  currency: "INR",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getCart.mockResolvedValue(CART);
});

describe("CreditsCart", () => {
  it("shows nothing at all to an account this counter is not for", async () => {
    // A shop buys at its plan's rate. Rendering a retail price list for it would quote
    // ₹149 for something it pays a tier rate for, on a screen whose every button 403s.
    api.getCart.mockResolvedValue({ ...CART, eligible: false });
    const { container } = render(<CreditsCart />);

    await waitFor(() => expect(api.getCart).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("prices the basket from the server's own rates as quantities change", async () => {
    render(<CreditsCart />);

    await screen.findByText("One project");
    await userEvent.click(screen.getByRole("button", { name: "One more One project" }));

    expect(screen.getByRole("button", { name: "Pay ₹149" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "One more One AI image credit" }));
    expect(screen.getByRole("button", { name: "Pay ₹219" })).toBeInTheDocument();
  });

  it("applies the earned offer without being asked, and keeps the rest out of reach", async () => {
    // The server applies the best earned offer whatever this screen sends, so a cart that
    // waited to be told would quote a total higher than the one it then charges.
    render(<CreditsCart />);

    // Two projects: ₹298, past the ₹289 threshold and short of ₹589.
    const more = await screen.findByRole("button", { name: "One more One project" });
    await userEvent.click(more);
    await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE10/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /HUE20/ })).toBeDisabled();
    // ₹298 less 10% = ₹268.20 — a rounding the server does the same way, down to the paisa.
    expect(screen.getByText("−₹29.80")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₹268.20" })).toBeInTheDocument();
  });

  it("lets the buyer pick between offers once more than one is earned", async () => {
    // At ₹1,043 all three are unlocked, so which one applies is a genuine choice — that is
    // what the chips are for. The best is on by default; tapping a chip never turns the
    // discount off, only moves it.
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more One project" });
    for (let i = 0; i < 7; i += 1) await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE25/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pay ₹782.25" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /HUE10/ }));
    expect(screen.getByRole("button", { name: "Pay ₹938.70" })).toBeInTheDocument();
  });

  it("says what is still needed to reach the next offer", async () => {
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more One project" }));
    // ₹149 of single lines in the basket, ₹289 for the first offer.
    expect(screen.getByText(/Add ₹140 more of single projects or credits to save 10%/))
      .toBeInTheDocument();
  });

  it("sends quantities and the applied code, never a price", async () => {
    checkoutCart.mockResolvedValue({ ...CART, availableProjects: 2, creditBalance: 4 });
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more One project" });
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("button", { name: /HUE10/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay/ }));

    await waitFor(() =>
      expect(checkoutCart).toHaveBeenCalledWith({
        projects: 2,
        credits: 0,
        combos: 0,
        bundles: 0,
        discountCode: "HUE10",
      }),
    );
    // The basket empties and the new balances land, so the page tells the truth about what
    // the account holds without a reload.
    expect(await screen.findByText(/Paid — your projects and credits/)).toBeInTheDocument();
    expect(screen.getByText(/you hold 2 projects and 4 credits/)).toBeInTheDocument();
  });

  it("counts a combo's contents into what the basket hands over", async () => {
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    await userEvent.click(more);
    await userEvent.click(more);

    // Two combos = two projects and two credits, not "2 combos" — the buyer is being told
    // what lands on their account, which is the only description that survives a combo.
    expect(screen.getByText(/2 projects and 2 AI image credits · valid for a year/))
      .toBeInTheDocument();
  });

  // ── The special offer ───────────────────────────────────────────────────
  //
  // Three rooms and three pictures for the price of two of each. It is a LINE, priced by
  // the server, and everything the buyer reads about it — the price, the struck-through
  // figure, the saving — has to be the server's arithmetic rather than this screen's.

  it("prices the special offer from the server and unpacks what it hands over", async () => {
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more Special offer" }));

    // ₹438 also appears on the bill below, which is the point — the offer's own price and
    // the line it adds to the basket are the same number.
    expect(screen.getAllByText("₹438").length).toBeGreaterThan(0);
    expect(screen.getByText("₹657")).toBeInTheDocument();
    expect(screen.getByText("Save ₹219")).toBeInTheDocument();
    expect(screen.getByText(/3 projects and 3 AI image credits · valid for a year/))
      .toBeInTheDocument();
  });

  it("sends the bundle quantity and charges its ticket price, with no percentage on top", async () => {
    // The bundle's saving is already in its price — ₹438 for what costs ₹657 line by line.
    // A further 10% would discount the same basket twice at a rate nobody set, so the
    // offers neither light up nor come off, and the total is the price on the ticket.
    checkoutCart.mockResolvedValue(CART);
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more Special offer" }));
    expect(screen.getByRole("button", { name: /HUE10/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /HUE10/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pay ₹438" }));

    await waitFor(() =>
      expect(checkoutCart).toHaveBeenCalledWith({
        projects: 0,
        credits: 0,
        combos: 0,
        bundles: 1,
        discountCode: undefined,
      }),
    );
  });

  // ── Packages against percentages ────────────────────────────────────────
  //
  // The combo and the bundle carry their saving in their own price. The percentage offers
  // are the other half of the counter: earned on the single lines, taken off the single
  // lines. The threshold and the discount are the same number, so no basket can light up
  // "10% applied" and then take ₹0 off.

  it("keeps a package out of the offer it sits beside", async () => {
    render(<CreditsCart />);

    // Two projects (₹298 — enough for HUE10 on their own) and a combo alongside them.
    const project = await screen.findByRole("button", { name: "One more One project" });
    await userEvent.click(project);
    await userEvent.click(project);
    await userEvent.click(screen.getByRole("button", { name: "One more Room + pictures" }));

    // ₹497 rung up, 10% off the ₹298 of single lines, ₹467.20 to pay.
    expect(screen.getByText("₹497")).toBeInTheDocument();
    expect(screen.getByText("−₹29.80")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₹467.20" })).toBeInTheDocument();
    // And the bill says which half the percentage came off, because there are two halves
    // in this basket to tell apart.
    expect(screen.getByText(/₹298 of single lines/)).toBeInTheDocument();
  });

  it("does not dangle an offer a basket of packages alone can never collect", async () => {
    // ₹995 of combos is past every threshold on the board and earns none of them. Showing
    // HUE25 as applied and then taking ₹0 off would read as a bug, and would be one.
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    for (let i = 0; i < 5; i += 1) await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE25/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pay ₹995" })).toBeInTheDocument();
  });

  it("lets the server put the packages back inside the offer", async () => {
    // Which half the offers reach is a campaign setting, not this screen's rule. Flipped
    // on, the whole basket earns and receives again.
    api.getCart.mockResolvedValue({ ...CART, offersApplyToPackages: true });
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    await userEvent.click(more);
    await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE10/ })).toHaveAttribute("aria-pressed", "true");
    // ₹398 less 10% = ₹358.20 — exactly what the counter charged before the split.
    expect(screen.getByRole("button", { name: "Pay ₹358.20" })).toBeInTheDocument();
  });

  it("hides the offer entirely when it is not running", async () => {
    // Wound down rather than discounted to nothing: a "special offer" that saves ₹0 is
    // worse than no offer at all.
    api.getCart.mockResolvedValue({ ...CART, bundleAvailable: false });
    render(<CreditsCart />);

    await screen.findByText("One project");
    expect(screen.queryByText("Special offer")).not.toBeInTheDocument();
  });

  it("stops the Pay button dead when verification fails after the charge", async () => {
    // The one failure that must never be told to try again: the money has already left.
    const { PaymentVerificationError } = await import("@/lib/payments");
    checkoutCart.mockRejectedValue(new PaymentVerificationError("We could not confirm it."));
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more One project" }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay/ }));

    expect(await screen.findByText(/do not pay again/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pay/ })).toBeDisabled();
  });
});
