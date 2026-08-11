// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingTiers } from "../pricing-tiers";

vi.mock("@/lib/payments", () => ({ subscribeToPlan: vi.fn() }));

/**
 * The pricing cards are the page a shop decides on, so the things that were wrong
 * with them are worth pinning:
 *
 *  - The quota read as cumulative. Under "Everything in Starter, plus", a bare "45
 *    projects" was read as Starter's 15 AND another 45. The fix for that put the
 *    sum in the line ("15 + 30 = 45 projects"), which traded one problem for
 *    another: the maths ended up doing the copywriting. The card now states the
 *    total and keeps the derivation as a footnote on the same element, so both
 *    readings stay closed off.
 *  - "Points" were priced on the cards before anything said what they are — the
 *    definition was the seventh FAQ answer, far below. The rupee price leads now,
 *    and the credit is explained where it is first mentioned.
 *  - Enterprise was a card with no price, no checkout path and no tier a shop could
 *    actually be put on. It is gone, and the backend no longer serves it from
 *    /api/billing/plans either — this test fails if it creeps back into one and not the
 *    other.
 *  - Free is the opposite case and has to stay the opposite case: a real tier that a
 *    shop IS on, which must never grow a checkout button, because the only answer that
 *    button could give is "there's nothing to pay".
 */
describe("PricingTiers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states the project total, with the derivation as a footnote", () => {
    render(<PricingTiers />);
    // The number on the card is the number the shop gets — no sum to solve.
    expect(screen.getByText("45 projects a month")).toBeTruthy();
    expect(screen.getByText("100 projects a month")).toBeTruthy();
    expect(screen.getByText(/^15 projects a month/)).toBeTruthy();
    // …and the cumulative misreading stays closed off, one level down.
    expect(screen.getByText("45 projects a month").getAttribute("title"))
      .toMatch(/15 plus 30 more/);
  });

  it("does the same for colour boards", () => {
    render(<PricingTiers />);
    expect(screen.getByText("100 colour boards a month (8 photos each)")).toBeTruthy();
    expect(screen.getByText("300 colour boards a month (12 photos each)")).toBeTruthy();
    expect(screen.getByText("300 colour boards a month (12 photos each)").getAttribute("title"))
      .toMatch(/100 plus 200 more/);
  });

  it("leads extras with the rupee price and explains points where they first appear", () => {
    render(<PricingTiers />);
    const starterExtras = screen.getByText(/Extra projects ₹65 each, or 60 points/);
    expect(starterExtras).toBeTruthy();
    expect(starterExtras.getAttribute("title")).toMatch(/credit/i);
  });

  it("offers exactly the three buyable tiers, and no Enterprise card", () => {
    render(<PricingTiers />);
    expect(screen.queryByText(/enterprise/i)).toBeNull();
    expect(screen.queryByText(/on request/i)).toBeNull();
    // Four cards, three of them bought. There is no "talk to us" dead end left, and the
    // free one leads to the account rather than to a ₹0 checkout.
    expect(screen.getAllByRole("button", { name: /buy now/i })).toHaveLength(3);
    expect(screen.getByRole("link", { name: /start free →/i }).getAttribute("href"))
      .toBe("/trial");
  });

  /** The free tier is a card on the ladder, priced in words and honest about what it
   *  withholds. */
  it("shows the free tier with its allowance, its renewal and its exclusions", () => {
    render(<PricingTiers />);
    expect(screen.getByText(/^2 projects a month/)).toBeTruthy();
    // "Renews" is the whole difference from the seven-day trial it replaced.
    expect(screen.getByText(/Renews every month/)).toBeTruthy();
    expect(screen.getByText(/Extra projects ₹199 each, or 80 points/)).toBeTruthy();
    // Colour matching is one tier line, and the card says so rather than leaving a
    // shop to notice the tab missing later.
    expect(screen.getByText("No colour finder")).toBeTruthy();
    // The catalogue is the other: a free counter works with one paint company, and a
    // shop reads that here rather than discovering it in the studio's company picker.
    expect(screen.getByText(/One paint company — Asian Paints/)).toBeTruthy();
    expect(screen.getByText(/Every paint company your distributor has assigned you/)).toBeTruthy();
    // Priced in words: "₹0 / month" reads like an invoice for nothing.
    expect(screen.queryByText("₹0")).toBeNull();
  });

  /** A CUSTOMER can't hold a shop plan, so they get the access-code route instead. */
  it("points a signed-in customer at their shop's code rather than a buy button", () => {
    render(<PricingTiers isCustomer />);
    expect(screen.queryByRole("button", { name: /buy now/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: /unlock with a shop code/i })).toHaveLength(4);
  });

  /**
   * The question a ₹0 card actually raises is who is allowed on it. "For good"
   * answered how long it lasts — which nobody was asking, and which the line
   * underneath already covers.
   */
  it("says the free plan is for paint shops, on the price line and in the list", () => {
    render(<PricingTiers />);
    expect(screen.getByText("for paint shops")).toBeTruthy();
    expect(screen.getByText("For paint shops only")).toBeTruthy();
    // The renewal promise didn't disappear — it moved to the billing line.
    expect(screen.getByText(/renews every month, for good/i)).toBeTruthy();
  });

  /**
   * Signup is closed to anyone already holding an account, so the free card's
   * signup link would be a button that bounces straight back to the home page.
   */
  it("sends a signed-in visitor to their dashboard instead of back through signup", () => {
    render(<PricingTiers signedIn />);
    expect(screen.getByRole("link", { name: /Go to your dashboard/ })).toHaveAttribute("href", "/dashboard");
    // Every route into signup is gone, including the paid cards' "Start free
    // instead" — all of them would only bounce off the guest-only guard.
    expect(screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/trial")).toHaveLength(0);
  });

  it("keeps the signup route for a visitor who has no account yet", () => {
    render(<PricingTiers />);
    // The free card's own CTA — anchored past the arrow so it can't also match
    // the paid cards' "Start free instead".
    expect(screen.getByRole("link", { name: /^Start free\s*→$/ })).toHaveAttribute("href", "/trial");
    // The three paid cards keep their "start free instead" way out.
    expect(screen.getAllByRole("link", { name: "Start free instead" })).toHaveLength(3);
  });
});
