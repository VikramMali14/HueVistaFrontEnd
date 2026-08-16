import type { AppFeatureKey, MyAccess } from "./types";

/**
 * Reading a shop's page access — which has two independent halves.
 *
 * These are plain functions in their own module on purpose. `auth.ts` carries a
 * `"use server"` directive, which allows only async exports, and the app nav is a
 * client component that needs the same answer synchronously — so the one place
 * that decides "may this shop open this page?" has to live outside both.
 *
 * That sharing is the point: the nav hides tabs with these, the server page guards
 * bounce with these, and a hidden tab therefore can never disagree with a blocked
 * page. Neither is the security boundary — the backend enforces the same rules on
 * every endpoint behind these pages. This is what keeps the UI honest about it.
 *
 * Two things can close a page, and they are kept apart all the way through because
 * they need different words: the shop's DISTRIBUTOR did not grant it (ring the
 * distributor), or the shop's own PLAN does not include it (press subscribe). The free
 * plan withholds exactly one page today — the Colour finder — and telling that shop to
 * ask its distributor about it would send them somewhere nobody can help.
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
  if (!access) return true;
  if (planWithholds(access, feature)) return false;
  if (!access.featuresRestricted) return true;
  return access.allowedFeatures.includes(feature);
}

/**
 * Whether the shop's own PLAN is what closes this page.
 *
 * Fails OPEN on a missing list for the same reason `canUseFeature` fails open on null
 * access: a server too old to send it, or one that could not be reached, must read as
 * "nothing withheld" rather than as "everything withheld".
 */
export function planWithholds(access: MyAccess | null, feature: AppFeatureKey): boolean {
  return access?.planLockedFeatures?.includes(feature) ?? false;
}

/** The same question keyed by route, for the nav and the denial hint. */
export function planWithholdsPath(access: MyAccess | null, path: string): boolean {
  const feature = FEATURE_BY_PATH[path];
  return feature ? planWithholds(access, feature) : false;
}

/** The same question keyed by route, for nav tabs that only know their href. */
export function canUsePath(access: MyAccess | null, path: string): boolean {
  if (!access) return true;
  if (planWithholdsPath(access, path)) return false;
  if (!access.featuresRestricted) return true;
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
  // The account's AI images. Behind the studio's own grant rather than a grant of its
  // own: the images are made BY a studio project, so a shop without the studio has none
  // — and the page and `GET /api/me/renders` both check STUDIO, so listing it here is
  // what keeps the tab from outliving the page it leads to.
  "/ai-images": "STUDIO",
  "/colour-finder": "COLOR_FINDER",
  "/catalogue": "CATALOGUE",
  "/products": "PRODUCTS",
  "/portal": "CUSTOMER_PORTAL",
  "/network": "NETWORK",
};

/**
 * Whether a SHOP may reach the painter module — creating painter accounts and
 * reading its painter roster, which is all /network is for a retailer.
 *
 * Off while the module is still being tested. It is deliberately one constant
 * rather than three edits: the nav tab, the dashboard shortcut and the page guard
 * all read it, so switching it back on restores the whole thing at once and can
 * never leave a visible tab pointing at a page that bounces. Admins and
 * distributors are unaffected — /network is their console for the entire downline,
 * and it is only the shop-facing half that is unfinished.
 */
export const SHOP_PAINTER_MODULE_ENABLED = false;

/** Human labels for the denial hint on /dashboard, keyed by feature. */
export const FEATURE_LABELS: Record<AppFeatureKey, string> = {
  STUDIO: "Studio",
  COLOR_FINDER: "Colour finder",
  CATALOGUE: "Catalogue",
  PRODUCTS: "Products",
  CUSTOMER_PORTAL: "Customer portal",
  NETWORK: "My network",
};
