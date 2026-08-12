// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Footer } from "../footer";
import { Nav } from "../nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));
// The nav animates its mobile panel with GSAP, which needs a layout engine jsdom
// doesn't have. Only the links matter here.
vi.mock("gsap", () => {
  const timeline = () => {
    const tl = { to: () => tl, fromTo: () => tl, set: () => tl, kill: () => tl };
    return tl;
  };
  return {
    gsap: {
      set: () => {},
      to: () => {},
      fromTo: () => {},
      killTweensOf: () => {},
      timeline,
      context: (fn: () => void) => {
        fn();
        return { revert: () => {}, kill: () => {} };
      },
    },
  };
});

/**
 * Every public marketing route is published, so the header and footer link to all
 * of them unconditionally. /gallery, /work and /journal spent a while behind an
 * env flag (NEXT_PUBLIC_SHOWCASE_CONTENT) that 404'd them and stripped their links
 * from the chrome; the flag is gone, and these assertions are what stops a partial
 * revert from leaving a page reachable only by typing its URL.
 */
const PUBLIC_ROUTES = ["/method", "/catalogue", "/gallery", "/pricing", "/journal", "/unlock"];

function hrefsIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
}

describe("the header links to every public page", () => {
  it("offers them all when signed out", () => {
    const hrefs = hrefsIn(render(<Nav />).container);
    for (const route of PUBLIC_ROUTES) expect(hrefs).toContain(route);
  });

  it("offers them to a signed-in visitor too", () => {
    const hrefs = hrefsIn(render(<Nav authed />).container);
    for (const route of PUBLIC_ROUTES) expect(hrefs).toContain(route);
  });

  it("puts Our work in the signed-out mobile panel", () => {
    expect(hrefsIn(render(<Nav />).container)).toContain("/work");
  });
});

describe("the footer links to every public page", () => {
  it("renders links at all, so the checks below are not vacuous", () => {
    expect(hrefsIn(render(<Footer />).container).length).toBeGreaterThan(5);
  });

  it("offers Gallery, Our work and Journal", () => {
    const hrefs = hrefsIn(render(<Footer />).container);
    for (const route of ["/gallery", "/work", "/journal"]) expect(hrefs).toContain(route);
  });
});
