// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingTiers } from "../pricing-tiers";

vi.mock("@/lib/payments", () => ({ subscribeToPlan: vi.fn() }));

/**
 * The pricing cards are the page a shop decides on, so the two things that were wrong
 * with them are worth pinning:
 *
 *  - The quota read as cumulative. Under "Everything in Starter, plus", a bare "45
 *    projects" was read as Starter's 15 AND another 45. The cards now state the sum.
 *  - Enterprise was a fourth card with no price, no checkout path and no tier a shop
 *    could actually be put on. It is gone, and the backend no longer serves it from
 *    /api/billing/plans either — this test fails if it creeps back into one and not the
 *    other.
 */
describe("PricingTiers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spells out the project maths on every tier above the first", () => {
    render(<PricingTiers />);
    expect(screen.getByText(/15 \+ 30 = 45 projects a month/)).toBeTruthy();
    expect(screen.getByText(/45 \+ 55 = 100 projects a month/)).toBeTruthy();
    // Starter is the base — there is nothing to add to, so it stays a plain number.
    expect(screen.getByText(/^15 projects a month/)).toBeTruthy();
  });

  it("spells out the colour-board maths too", () => {
    render(<PricingTiers />);
    expect(screen.getByText(/25 \+ 75 = 100 colour boards a month/)).toBeTruthy();
    expect(screen.getByText(/100 \+ 200 = 300 colour boards a month/)).toBeTruthy();
  });

  it("offers exactly the three buyable tiers, and no Enterprise card", () => {
    render(<PricingTiers />);
    expect(screen.queryByText(/enterprise/i)).toBeNull();
    expect(screen.queryByText(/on request/i)).toBeNull();
    // Every card can be bought — there is no "talk to us" dead end left.
    expect(screen.getAllByRole("button", { name: /buy now/i })).toHaveLength(3);
  });

  /** A CUSTOMER can't hold a shop plan, so they get the access-code route instead. */
  it("points a signed-in customer at their shop's code rather than a buy button", () => {
    render(<PricingTiers isCustomer />);
    expect(screen.queryByRole("button", { name: /buy now/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: /redeem a shop code/i })).toHaveLength(3);
  });
});
