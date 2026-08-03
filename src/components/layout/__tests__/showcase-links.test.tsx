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
 * /gallery, /work and /journal are placeholder editorial pages that the middleware
 * answers with a 404 while `NEXT_PUBLIC_SHOWCASE_CONTENT` is unset (see
 * lib/showcase). The chrome must not offer a link to a page that will 404 — the
 * header and footer linked to all three before they were withheld, and that is the
 * half of the change a reader would actually notice.
 *
 * The env var is unset in the test run, so these render in their withheld state.
 */
const WITHHELD = ["/gallery", "/work", "/journal"];

function hrefsIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
}

function offending(hrefs: string[]): string[] {
  return hrefs.filter((h) => WITHHELD.some((p) => h === p || h.startsWith(`${p}/`)));
}

describe("chrome never links to a withheld page", () => {
  it("renders links at all, so the checks below are not vacuous", () => {
    const { container } = render(<Footer />);
    expect(hrefsIn(container).length).toBeGreaterThan(5);
  });

  it("keeps Gallery, Our work and Journal out of the footer", () => {
    const { container } = render(<Footer />);
    expect(offending(hrefsIn(container))).toEqual([]);
  });

  it("keeps Gallery and Journal out of the header, signed out", () => {
    const { container } = render(<Nav />);
    expect(hrefsIn(container).length).toBeGreaterThan(3);
    expect(offending(hrefsIn(container))).toEqual([]);
  });

  it("keeps them out of the header for a signed-in visitor too", () => {
    const { container } = render(<Nav authed />);
    expect(offending(hrefsIn(container))).toEqual([]);
  });

  it("still offers the pages that are real", () => {
    const { container } = render(<Nav />);
    const hrefs = hrefsIn(container);
    expect(hrefs).toContain("/catalogue");
    expect(hrefs).toContain("/pricing");
    expect(hrefs).toContain("/method");
  });
});
