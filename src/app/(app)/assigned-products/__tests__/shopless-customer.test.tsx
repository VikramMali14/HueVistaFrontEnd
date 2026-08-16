import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "My products" belongs to a customer a SHOP onboarded, and redeeming that shop's
 * access code is the only thing that creates the link — nothing else does. So the
 * page has two audiences it must turn away, for two different reasons:
 *
 *  - anyone who is not a CUSTOMER (handled by requireRole), and
 *  - a CUSTOMER with no shop behind them: an account that signed up on its own with
 *    Google or an e-mail address, which has no code, no entitlement and therefore no
 *    assigned products for as long as it redeems nothing.
 *
 * The second used to render a page of its own explaining the emptiness. That made
 * "My products" look like a real part of a shopless customer's account that merely
 * had nothing in it yet — reachable, titled and bookmarkable for an account it can
 * never have anything to say to. It now bounces to the dashboard, which is the same
 * answer requireRole and requireFeature already give for a page you may not open,
 * and the banner there names the one thing that changes the answer.
 */

const requireRole = vi.fn(async () => ({ id: "u1", role: "CUSTOMER" }));
const customerShopStatus = vi.fn(async (): Promise<"linked" | "none" | "unknown"> => "linked");
const redirect = vi.fn((path: string) => {
  // Next's redirect() throws to unwind the render; mirroring that keeps the page's
  // control flow under test honest — a redirect must STOP the page, not merely be
  // recorded on the way past it.
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("@/lib/auth", () => ({ requireRole, customerShopStatus }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/app/assigned-products", () => ({
  AssignedProductsView: () => null,
}));

const { default: AssignedProductsPage } = await import("../page");

beforeEach(() => {
  vi.clearAllMocks();
  customerShopStatus.mockResolvedValue("linked");
});

describe("/assigned-products", () => {
  it("is customers only", async () => {
    await AssignedProductsPage();
    expect(requireRole).toHaveBeenCalledWith(["CUSTOMER"]);
  });

  it("sends a customer with no shop to the dashboard instead of rendering", async () => {
    customerShopStatus.mockResolvedValue("none");

    await expect(AssignedProductsPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard?denied=noshop");
    expect(redirect).toHaveBeenCalledWith("/dashboard?denied=noshop");
  });

  it("renders for a customer a shop actually onboarded", async () => {
    customerShopStatus.mockResolvedValue("linked");

    await expect(AssignedProductsPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  /**
   * The failure this guard must not turn into a verdict. Bouncing here would tell a
   * customer who redeemed a code last week that no shop stands behind their account,
   * and would do it every time the entitlement read hiccups — a confident lie told to
   * the exact people the page exists for.
   */
  it("keeps the page open when the entitlement could not be read at all", async () => {
    customerShopStatus.mockResolvedValue("unknown");

    await expect(AssignedProductsPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
