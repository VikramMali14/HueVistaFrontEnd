// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Hero } from "../hero";
import { aspectDrift, slotById, type SiteAsset, type SiteAssetMap } from "@/lib/site-assets";

/**
 * The home page's before/after slider, once its pictures became something an
 * admin uploads rather than something a developer commits.
 *
 * The single rule worth pinning is that an EMPTY slot is not a failure. Nothing
 * has been uploaded on a fresh install; the backend can be unreachable when the
 * page renders; an admin can clear a slot on purpose. In all three the hero has
 * to look finished, because it is the first thing a visitor sees and there is no
 * second chance at it. Every other behaviour here is in service of that.
 */

const asset = (slot: string, url: string, extra: Partial<SiteAsset> = {}): SiteAsset => ({
  slot,
  url,
  contentType: "image/jpeg",
  fileSize: 120_000,
  width: 2100,
  height: 1000,
  originalFilename: "room.jpg",
  updatedAt: "2026-08-06T09:00:00",
  ...extra,
});

/** The element the slider paints a pane's background onto. */
function paneBackgrounds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>(".compare > div")].map(
    (el) => el.style.background,
  );
}

describe("Hero — uploaded before/after images", () => {
  it("falls back to the built-in washes when nothing has been uploaded", () => {
    const { container } = render(<Hero />);
    const panes = paneBackgrounds(container);
    expect(panes).toHaveLength(2);
    // Gradients, not urls — the hero stands on its own with an empty database.
    expect(panes.every((b) => b.includes("gradient"))).toBe(true);
    expect(panes.some((b) => b.includes("url("))).toBe(false);
  });

  it("treats an unreachable backend the same as an empty one", () => {
    // fetchSiteAssets answers {} rather than throwing, so this is the shape the
    // hero actually receives during an outage.
    const { container } = render(<Hero assets={{}} />);
    expect(paneBackgrounds(container).every((b) => b.includes("gradient"))).toBe(true);
  });

  it("uses the uploaded pair once both slots are filled", () => {
    const assets: SiteAssetMap = {
      "home.compare.before": asset("home.compare.before", "https://api.test/api/site-assets/home.compare.before/file?v=1"),
      "home.compare.after": asset("home.compare.after", "https://api.test/api/site-assets/home.compare.after/file?v=1"),
    };
    const { container } = render(<Hero assets={assets} />);
    const panes = paneBackgrounds(container);
    expect(panes.some((b) => b.includes("home.compare.before"))).toBe(true);
    expect(panes.some((b) => b.includes("home.compare.after"))).toBe(true);
  });

  it("lets one half be replaced without breaking the other", () => {
    // An admin uploads the "after" first. The hero must not go blank, or half
    // black, while they find the matching "before".
    const assets: SiteAssetMap = {
      "home.compare.after": asset("home.compare.after", "https://api.test/after.jpg"),
    };
    const { container } = render(<Hero assets={assets} />);
    const panes = paneBackgrounds(container);
    expect(panes.some((b) => b.includes("after.jpg"))).toBe(true);
    expect(panes.some((b) => b.includes("gradient"))).toBe(true);
  });

  it("ignores a slot the registry does not know about", () => {
    const { container } = render(
      <Hero assets={{ "home.nonsense": asset("home.nonsense", "https://api.test/x.jpg") }} />,
    );
    expect(paneBackgrounds(container).every((b) => b.includes("gradient"))).toBe(true);
  });
});

describe("aspect drift", () => {
  const slot = slotById("home.compare.before")!;

  it("is about 1 for an image already at the slot's shape", () => {
    const drift = aspectDrift(asset("home.compare.before", "/x", { width: 2100, height: 1000 }), slot);
    expect(drift).toBeCloseTo(1, 2);
  });

  it("grows for an image far off the shape, in either direction", () => {
    const tall = aspectDrift(asset("home.compare.before", "/x", { width: 1000, height: 1400 }), slot)!;
    const wide = aspectDrift(asset("home.compare.before", "/x", { width: 4000, height: 600 }), slot)!;
    expect(tall).toBeGreaterThan(1.25);
    expect(wide).toBeGreaterThan(1.25);
  });

  it("says nothing when the dimensions could not be read", () => {
    expect(aspectDrift(asset("home.compare.before", "/x", { width: null, height: null }), slot)).toBeNull();
  });
});
