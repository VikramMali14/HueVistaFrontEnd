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

    // Two combos: ₹398, past the ₹289 threshold and short of ₹589.
    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    await userEvent.click(more);
    await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE10/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /HUE20/ })).toBeDisabled();
    // ₹398 less 10% = ₹358.20 — a rounding the server does the same way, down to the paisa.
    expect(screen.getByText("−₹39.80")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₹358.20" })).toBeInTheDocument();
  });

  it("lets the buyer pick between offers once more than one is earned", async () => {
    // At ₹995 all three are unlocked, so which one applies is a genuine choice — that is
    // what the chips are for. The best is on by default; tapping a chip never turns the
    // discount off, only moves it.
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    for (let i = 0; i < 5; i += 1) await userEvent.click(more);

    expect(screen.getByRole("button", { name: /HUE25/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pay ₹746.25" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /HUE10/ }));
    expect(screen.getByRole("button", { name: "Pay ₹895.50" })).toBeInTheDocument();
  });

  it("says what is still needed to reach the next offer", async () => {
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more Room + pictures" }));
    // ₹199 in the basket, ₹289 for the first offer.
    expect(screen.getByText(/Add ₹90 more to save 10%/)).toBeInTheDocument();
  });

  it("sends quantities and the applied code, never a price", async () => {
    checkoutCart.mockResolvedValue({ ...CART, availableProjects: 2, creditBalance: 4 });
    render(<CreditsCart />);

    const more = await screen.findByRole("button", { name: "One more Room + pictures" });
    await userEvent.click(more);
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("button", { name: /HUE10/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Pay/ }));

    await waitFor(() =>
      expect(checkoutCart).toHaveBeenCalledWith({
        projects: 0,
        credits: 0,
        combos: 2,
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

  it("sends the bundle quantity and stacks the earned percentage on top of it", async () => {
    // The bundle is the price of the line, not a code, so a basket holding one is still
    // big enough to have earned HUE10 — and the server would apply it whatever this screen
    // sent, so quoting the undiscounted total here would be quoting a total we do not
    // charge. No code travels: nobody tapped a chip, and the code is only ever a
    // preference between offers the basket has already earned.
    checkoutCart.mockResolvedValue(CART);
    render(<CreditsCart />);

    await userEvent.click(await screen.findByRole("button", { name: "One more Special offer" }));
    expect(screen.getByRole("button", { name: /HUE10/ })).toHaveAttribute("aria-pressed", "true");
    // ₹438 less 10% = ₹394.20.
    await userEvent.click(screen.getByRole("button", { name: "Pay ₹394.20" }));

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
