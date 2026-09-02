// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import type { AuthUser } from "@/lib/types";
import { AppNav } from "../app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/studio" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@/components/support/bug-report-button", () => ({
  BugReportButton: () => <button type="button">Report a problem</button>,
}));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => <button type="button">Theme</button> }));

/**
 * Getting OUT of the studio on a phone.
 *
 * The studio owns the whole screen and the navbar scrolls away with the page, so
 * everything here is about the one question somebody in the studio asks: how do I
 * get back to my dashboard? Two separate faults used to answer "you don't".
 */

const retailer: AuthUser = {
  id: "u1",
  name: "Rajesh",
  email: "shop@example.com",
  provider: "LOCAL",
  role: "RETAILER",
};

const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("studio navigation on a phone", () => {
  it("keeps a Dashboard link on the studio's own bar, outside the drawer", () => {
    render(<AppNav user={retailer} />);
    const minibar = document.querySelector(".studio-minibar");
    expect(minibar).not.toBeNull();
    // Not behind the hamburger: a link that is always on screen is the point, because
    // the menu button itself scrolls off the top of a phone once you are working.
    const back = within(minibar as HTMLElement).getByRole("link", { name: /dashboard/i });
    expect(back).toHaveAttribute("href", "/dashboard");
  });

  it("renders the studio bar on every studio route, not only the index", () => {
    render(<AppNav user={retailer} />);
    expect(document.querySelector(".studio-minibar-links")).not.toBeNull();
  });

  it("still offers the full tab list in the drawer", () => {
    render(<AppNav user={retailer} />);
    const drawer = document.querySelector(".app-tabs.is-mobile") as HTMLElement;
    const hrefs = [...drawer.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/dashboard", "/studio"]));
  });
});

/**
 * These two assert CSS rather than DOM because the bugs they cover were CSS, and
 * jsdom computes no layout or stacking to catch them any other way. Both were
 * reported the same way — "I open the menu and I can't see anything" — and both are
 * a single declaration away from coming back.
 */
describe("the mobile drawer's CSS invariants", () => {
  it("keeps the studio navbar positioned, so its z-index still applies", () => {
    // `position: static` drops z-index entirely. The drawer hangs off this bar and
    // the scrim is deliberately kept just below it (z-index 55 vs 60) — so a static
    // bar put the scrim OVER the open menu: dimmed, blurred, and every tab in it,
    // Dashboard included, untappable. The tap hit the scrim and only closed the menu.
    const rule = /\.app-header-studio\s+\.app-nav-inner\s*\{([^}]*)\}/.exec(globalsCss);
    expect(rule, ".app-header-studio .app-nav-inner rule not found").not.toBeNull();
    expect(rule![1]).not.toMatch(/position:\s*static/);
    expect(rule![1]).toMatch(/position:\s*relative/);
  });

  it("caps the drawer's height and lets it scroll", () => {
    // The drawer was as tall as its tab list and the page behind it is scroll-locked
    // while it is open. An eleven-tab admin account on a 320x568 phone pushed Sign
    // out 83px below the bottom of the screen, with nothing left that could scroll.
    const rule = /\.app-tabs\.is-mobile\s*\{([^}]*)\}/.exec(globalsCss);
    expect(rule, ".app-tabs.is-mobile rule not found").not.toBeNull();
    expect(rule![1]).toMatch(/max-height:/);
    expect(rule![1]).toMatch(/overflow-y:\s*auto/);
  });
});

/**
 * Signing in on a phone. The art panel used to take the top of the single column,
 * which put the email field 1202px down a 664px screen — two screens of decoration
 * before the form. The form is ordered first now, and is first in the DOM too, so a
 * keyboard and a screen reader agree with what is drawn.
 */
describe("the sign-in layout on a phone", () => {
  it("orders the form ahead of the art panel", () => {
    // The form is drawn first, and the art panel follows it.
    expect(globalsCss).toMatch(/\.auth-form-wrap\s*\{[^}]*order:\s*1/);
    expect(globalsCss).toMatch(/\.auth-art\s*\{[^}]*order:\s*2/);
  });
});
