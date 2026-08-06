import type { AppFeatureKey, MyAccess } from "./types";

/**
 * Reading a shop's page grant.
 *
 * These are plain functions in their own module on purpose. `auth.ts` carries a
 * `"use server"` directive, which allows only async exports, and the app nav is a
 * client component that needs the same answer synchronously — so the one place
 * that decides "may this shop open this page?" has to live outside both.
 *
 * That sharing is the point: the nav hides tabs with these, the server page guards
 * bounce with these, and a hidden tab therefore can never disagree with a blocked
 * page. Neither is the security boundary — the backend enforces the same grant on
 * every endpoint behind these pages. This is what keeps the UI honest about it.
 */

/**
 * Whether a page is open to this caller.
 *
 * Fails OPEN on null access ("we couldn't load it"), which is a deliberate
 * asymmetry: a backend hiccup should not lock a paying shop out of pages its
 * distributor granted. The cost of failing open is a nav tab that leads to a 403,
 * not unauthorised access.
 *
 * Note that `featuresRestricted: false` is not the same as an empty
 * `allowedFeatures` — the first means "no limit", the second means "no pages".
 * Collapsing them is what would turn revoking a shop's last page into granting
 * them everything.
 */
export function canUseFeature(access: MyAccess | null, feature: AppFeatureKey): boolean {
  if (!access || !access.featuresRestricted) return true;
  return access.allowedFeatures.includes(feature);
}

/** The same question keyed by route, for nav tabs that only know their href. */
export function canUsePath(access: MyAccess | null, path: string): boolean {
  if (!access || !access.featuresRestricted) return true;
  const feature = FEATURE_BY_PATH[path];
  // A path with no feature behind it (dashboard, account, plan) is never
  // restrictable, so an unknown path is open rather than denied.
  return feature ? access.allowedFeatures.includes(feature) : true;
}

/**
 * Routes to the feature that gates them. Mirrors `AppFeature.getPath()` on the
 * backend; only pages a distributor can actually switch off appear here.
 */
export const FEATURE_BY_PATH: Record<string, AppFeatureKey | undefined> = {
  "/studio": "STUDIO",
  "/colour-finder": "COLOR_FINDER",
  "/catalogue": "CATALOGUE",
  "/products": "PRODUCTS",
  "/portal": "CUSTOMER_PORTAL",
  "/network": "NETWORK",
};

/** Human labels for the denial hint on /dashboard, keyed by feature. */
export const FEATURE_LABELS: Record<AppFeatureKey, string> = {
  STUDIO: "Studio",
  COLOR_FINDER: "Colour finder",
  CATALOGUE: "Catalogue",
  PRODUCTS: "Products",
  CUSTOMER_PORTAL: "Customer portal",
  NETWORK: "My network",
};
