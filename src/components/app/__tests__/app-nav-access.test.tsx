// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthUser, MyAccess } from "@/lib/types";
import { AppNav } from "../app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

/**
 * The nav is where the role rules and the distributor's page grant meet. The grant
 * must only ever SUBTRACT from what the role allows — it is a distributor deciding
 * what they sold a shop, not a second way to hand out privileges.
 */

const retailer: AuthUser = {
  id: "u1",
  name: "Priya",
  email: "shop@example.com",
  provider: "LOCAL",
  role: "RETAILER",
};

function access(over: Partial<MyAccess> = {}): MyAccess {
  return {
    role: "RETAILER",
    orgId: "org-1",
    orgName: "Mehta Paint House",
    brandsRestricted: false,
    allowedBrands: [],
    featuresRestricted: false,
    allowedFeatures: [],
    allowedPaths: [],
    ...over,
  };
}

/** Tab labels currently rendered (the desktop and drawer lists are duplicates). */
function tabs(): string[] {
  return Array.from(new Set(screen.getAllByRole("link").map((a) => a.textContent ?? "")));
}

describe("AppNav page grant", () => {
  it("shows an unrestricted shop its full set of tabs", () => {
    render(<AppNav user={retailer} access={access()} />);
    expect(tabs()).toEqual(expect.arrayContaining(["Studio", "Colour finder", "Customer portal", "Products"]));
  });

  it("hides the pages a distributor switched off", () => {
    render(
      <AppNav
        user={retailer}
        access={access({ featuresRestricted: true, allowedFeatures: ["CUSTOMER_PORTAL"] })}
      />,
    );
    const shown = tabs();
    expect(shown).toContain("Customer portal");
    expect(shown).not.toContain("Studio");
    expect(shown).not.toContain("Colour finder");
    expect(shown).not.toContain("Products");
  });

  it("keeps the dashboard and plan reachable even with everything revoked", () => {
    // These are never grantable: a shop that cannot open its billing page could
    // never fix a lapsed subscription without an admin.
    render(
      <AppNav user={retailer} access={access({ featuresRestricted: true, allowedFeatures: [] })} />,
    );
    const shown = tabs();
    expect(shown).toContain("Dashboard");
    expect(shown).toContain("Plan");
  });

  it("never lets a grant add a tab the role forbids", () => {
    const customer: AuthUser = { ...retailer, role: "CUSTOMER" };
    render(
      <AppNav
        user={customer}
        access={access({
          role: "CUSTOMER",
          featuresRestricted: true,
          // A grant naming pages a customer may never see.
          allowedFeatures: ["STUDIO", "PRODUCTS", "CUSTOMER_PORTAL", "NETWORK"],
        })}
      />,
    );
    const shown = tabs();
    expect(shown).not.toContain("Products");
    expect(shown).not.toContain("Customer portal");
    expect(shown).not.toContain("Network");
    expect(shown).not.toContain("Admin");
  });

  it("falls open when the grant could not be loaded", () => {
    render(<AppNav user={retailer} access={null} />);
    expect(tabs()).toEqual(expect.arrayContaining(["Studio", "Colour finder"]));
  });
});

/**
 * The Library tab follows the SHELF, not the role.
 *
 * Opening a free room asks the backend only for a session — the copy reuses the
 * stored photo and masks, so it costs nothing to serve — which is why every
 * signed-in role gets the tab. What it does depend on is whether anything is
 * published: the page has nothing to show while the shelf is empty, and the
 * public /gallery it mirrors is 404'd outright in that state, so an always-on tab
 * would be an always-on dead end.
 */
describe("AppNav library tab", () => {
  it("is absent while nothing is on the shelf", () => {
    render(<AppNav user={retailer} access={access()} />);
    expect(tabs()).not.toContain("Library");
  });

  it("appears for a shop once a room is published", () => {
    render(<AppNav user={retailer} access={access()} libraryLive />);
    expect(tabs()).toContain("Library");
  });

  it("appears for an admin, who is also the one who published it", () => {
    const admin: AuthUser = { ...retailer, role: "ADMIN" };
    render(<AppNav user={admin} access={null} libraryLive />);
    const shown = tabs();
    expect(shown).toContain("Library");
    expect(shown).toContain("Admin");
  });

  it("reaches a customer too — the room costs nothing to open", () => {
    const customer: AuthUser = { ...retailer, role: "CUSTOMER" };
    render(<AppNav user={customer} access={access({ role: "CUSTOMER" })} libraryLive />);
    expect(tabs()).toContain("Library");
  });
});

/**
 * A page the shop's OWN PLAN locks is not the same closure as one its distributor
 * withheld, and the nav now treats them differently.
 *
 * The distributor's is somebody else's decision: the tab goes, because it would
 * only lead somewhere nobody here can help. The plan's is the shop's own to
 * reverse in two clicks — and hiding it meant the shops who had never had the
 * tool were the only ones never told it existed. It keeps its tab, with a
 * padlock, and the page behind it opens locked and makes its own case.
 */
describe("AppNav plan lock", () => {
  const freeShop = access({ plan: "FREE", planLockedFeatures: ["COLOR_FINDER"] });

  it("keeps the tab a plan locks, unlike one a distributor withheld", () => {
    render(<AppNav user={retailer} access={freeShop} />);
    expect(tabs()).toContain("Colour finder");
  });

  it("marks it as locked rather than passing it off as included", () => {
    render(<AppNav user={retailer} access={freeShop} />);
    const tab = screen.getAllByRole("link", { name: "Colour finder" })[0]!;
    expect(tab).toHaveAttribute("title", "Colour finder — on the paid plans");
    expect(tab.querySelector(".nav-tab-lock")).not.toBeNull();
  });

  it("leaves an included page unmarked", () => {
    render(<AppNav user={retailer} access={access()} />);
    const tab = screen.getAllByRole("link", { name: "Colour finder" })[0]!;
    expect(tab).not.toHaveAttribute("title");
    expect(tab.querySelector(".nav-tab-lock")).toBeNull();
  });

  it("still drops the tab when the distributor is the one withholding it", () => {
    render(
      <AppNav
        user={retailer}
        access={access({ featuresRestricted: true, allowedFeatures: ["STUDIO"] })}
      />,
    );
    expect(tabs()).not.toContain("Colour finder");
  });
});
