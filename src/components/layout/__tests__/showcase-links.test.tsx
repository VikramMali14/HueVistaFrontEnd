// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Footer } from "../footer";
import { Nav } from "../nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));
// The footer is a server component that asks whether the gallery has rooms on it.
// Stubbed so these tests drive that answer instead of reaching for a backend.
const libraryHasRooms = vi.fn(async () => false);
vi.mock("@/lib/free-projects-server", () => ({
  libraryHasRooms: () => libraryHasRooms(),
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
 * /work and /journal are placeholder editorial pages that the middleware answers
 * with a 404 while `NEXT_PUBLIC_SHOWCASE_CONTENT` is unset (see lib/showcase). The
 * chrome must not offer a link to a page that will 404 — the header and footer
 * linked to all three before they were withheld, and that is the half of the
 * change a reader would actually notice.
 *
 * /gallery is no longer one of them, and that is the point of the second block
 * below: it lists the rooms an admin has published and opens by itself once the
 * shelf is not empty, so its link follows the SHELF rather than the flag. Both
 * directions matter — a link while the page 404s is a dead end, and no link while
 * the page is live is a library nobody can find.
 *
 * The env var is unset in the test run, so these render in their withheld state.
 */
const WITHHELD = ["/work", "/journal"];
/** Withheld too whenever the shelf is empty, which is the default below. */
const GALLERY = "/gallery";

function hrefsIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
}

function offending(hrefs: string[], paths: string[] = WITHHELD): string[] {
  return hrefs.filter((h) => paths.some((p) => h === p || h.startsWith(`${p}/`)));
}

/** The footer is async — call it and render what it resolves to. */
async function renderFooter() {
  return render(await Footer());
}

beforeEach(() => {
  libraryHasRooms.mockResolvedValue(false);
});

describe("chrome never links to a withheld page", () => {
  it("renders links at all, so the checks below are not vacuous", async () => {
    const { container } = await renderFooter();
    expect(hrefsIn(container).length).toBeGreaterThan(5);
  });

  it("keeps Our work and Journal out of the footer", async () => {
    const { container } = await renderFooter();
    expect(offending(hrefsIn(container))).toEqual([]);
  });

  it("keeps Journal out of the header, signed out", () => {
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

describe("the gallery link follows the shelf", () => {
  it("is withheld while nothing is published — the page 404s there", async () => {
    const { container: nav } = render(<Nav />);
    expect(offending(hrefsIn(nav), [GALLERY])).toEqual([]);
    const { container: footer } = await renderFooter();
    expect(offending(hrefsIn(footer), [GALLERY])).toEqual([]);
  });

  it("is offered in the header once a room is published", () => {
    const { container } = render(<Nav galleryLive />);
    expect(hrefsIn(container)).toContain(GALLERY);
  });

  it("is offered to a signed-in visitor too", () => {
    const { container } = render(<Nav authed galleryLive />);
    expect(hrefsIn(container)).toContain(GALLERY);
  });

  it("is offered in the footer once a room is published", async () => {
    libraryHasRooms.mockResolvedValue(true);
    const { container } = await renderFooter();
    expect(hrefsIn(container)).toContain(GALLERY);
  });
});
