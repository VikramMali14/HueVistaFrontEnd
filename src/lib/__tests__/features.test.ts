import { describe, it, expect } from "vitest";
import { canUseFeature, canUsePath, planWithholds, planWithholdsPath, FEATURE_BY_PATH, FEATURE_LABELS } from "../features";
import type { AppFeatureKey, MyAccess } from "@/lib/types";

/**
 * The whole reason this module exists is that "restricted to nothing" and "not
 * restricted" both arrive as an empty list, and treating them the same turns a
 * distributor's last revoke into a grant of everything. These tests pin that
 * distinction down, plus the deliberate fail-open on unknown access.
 */

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

describe("canUseFeature", () => {
  it("allows everything when the shop is not restricted", () => {
    expect(canUseFeature(access(), "STUDIO")).toBe(true);
    expect(canUseFeature(access(), "COLOR_FINDER")).toBe(true);
  });

  it("allows only what was granted when the shop is restricted", () => {
    const a = access({ featuresRestricted: true, allowedFeatures: ["COLOR_FINDER"] });
    expect(canUseFeature(a, "COLOR_FINDER")).toBe(true);
    expect(canUseFeature(a, "STUDIO")).toBe(false);
  });

  it("denies everything when restricted to an empty list", () => {
    // The case the three-state shape exists for: an empty allowance under
    // `restricted` means NO pages, and must not read as "no limit".
    const a = access({ featuresRestricted: true, allowedFeatures: [] });
    for (const key of Object.keys(FEATURE_LABELS) as AppFeatureKey[]) {
      expect(canUseFeature(a, key)).toBe(false);
    }
  });

  it("fails open when access could not be loaded", () => {
    // A backend hiccup must not strip a paying shop's pages — the backend still
    // enforces the same grant on every endpoint behind them.
    expect(canUseFeature(null, "STUDIO")).toBe(true);
  });

  it("closes a page the shop's own plan withholds", () => {
    // The free tier: unrestricted by its distributor, but the colour finder is not part
    // of the plan. Both halves have to be able to close a page on their own.
    const a = access({ planLockedFeatures: ["COLOR_FINDER"] });
    expect(canUseFeature(a, "COLOR_FINDER")).toBe(false);
    expect(canUseFeature(a, "STUDIO")).toBe(true);
    expect(canUsePath(a, "/colour-finder")).toBe(false);
    expect(canUsePath(a, "/studio")).toBe(true);
  });

  it("fails open when the server sends no plan-locked list at all", () => {
    // A server too old to send the field must read as "nothing withheld", never as
    // "everything withheld" — the same asymmetry as null access above.
    expect(planWithholds(access(), "COLOR_FINDER")).toBe(false);
    expect(planWithholds(null, "COLOR_FINDER")).toBe(false);
    expect(canUseFeature(access(), "COLOR_FINDER")).toBe(true);
  });
});

describe("planWithholds", () => {
  /**
   * The two denials stay tellable apart, because they need different words: one is
   * lifted by ringing the distributor, the other by pressing subscribe. Collapsing them
   * would send a free shop to a distributor who cannot switch the page on.
   */
  it("distinguishes a plan limit from a distributor revoke", () => {
    const byPlan = access({ planLockedFeatures: ["COLOR_FINDER"] });
    const byDistributor = access({ featuresRestricted: true, allowedFeatures: [] });

    expect(planWithholds(byPlan, "COLOR_FINDER")).toBe(true);
    expect(planWithholdsPath(byPlan, "/colour-finder")).toBe(true);

    // Both close the page, but only one of them is the plan's doing.
    expect(canUseFeature(byDistributor, "COLOR_FINDER")).toBe(false);
    expect(planWithholds(byDistributor, "COLOR_FINDER")).toBe(false);
  });

  it("never blames the plan for a route with no feature behind it", () => {
    const a = access({ planLockedFeatures: ["COLOR_FINDER"] });
    expect(planWithholdsPath(a, "/plan")).toBe(false);
    expect(canUsePath(a, "/plan")).toBe(true);
  });
});

describe("canUsePath", () => {
  it("maps each grantable route to its feature", () => {
    const a = access({ featuresRestricted: true, allowedFeatures: ["COLOR_FINDER"] });
    expect(canUsePath(a, "/colour-finder")).toBe(true);
    expect(canUsePath(a, "/studio")).toBe(false);
    expect(canUsePath(a, "/portal")).toBe(false);
  });

  it("never restricts a route with no feature behind it", () => {
    // Dashboard, account and plan are deliberately not grantable: a shop locked
    // out of billing could never fix a lapsed subscription.
    const a = access({ featuresRestricted: true, allowedFeatures: [] });
    expect(canUsePath(a, "/dashboard")).toBe(true);
    expect(canUsePath(a, "/account")).toBe(true);
    expect(canUsePath(a, "/plan")).toBe(true);
    expect(canUsePath(a, "/admin")).toBe(true);
  });

  it("has a label for every feature it can gate", () => {
    // A missing label would print a raw enum key at the user on the denial banner.
    for (const key of Object.values(FEATURE_BY_PATH)) {
      if (key) expect(FEATURE_LABELS[key]).toBeTruthy();
    }
  });
});
