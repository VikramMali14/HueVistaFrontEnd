/**
 * Backend paths the BFF proxy is allowed to forward. Anything not listed here is
 * answered with 403 "Forbidden path" before it ever reaches the backend, so a new
 * client call whose prefix is missing fails in a way that looks like a backend
 * bug — `api/me/assigned-products` shipped without its entry and made every
 * redeemed customer's "My products" page report that they had no products.
 *
 * Lives outside the route handler so a test can check every `browserFetch` path
 * in the API client against it without importing `next/server`.
 */
export const BFF_ALLOWED_PREFIXES = [
  "api/images",
  "api/projects",
  // Anonymous guest creator (upload + create one project + recolour), scoped by
  // the redeemed access code. Authed with the hv_guest token, not the user token.
  "api/guest",
  "api/auth/profile",
  "api/auth/me",
  // Email/mobile verification (send + confirm OTP). NOT "api/auth" — that would
  // also expose login/register/refresh/logout through the BFF.
  "api/auth/verify",
  // Change password from the account page (requires the current password; the
  // backend revokes every session on success).
  "api/auth/change-password",
  "api/me/entitlement",
  // A shop-onboarded customer asking their shop to add another project.
  "api/me/request-more-projects",
  // The companies + individual products the shop unlocked on the customer's code.
  "api/me/assigned-products",
  // The shop's suggested combinations for whoever is visualising (studio AI tab).
  "api/me/retailer-combos",
  // The shop's shade-code scheme — the studio encodes displayed codes with it.
  "api/me/shade-code-scheme",
  "api/billing/subscriptions",
  "api/billing/plans",
  // Pay-per-use billing the signed-in retailer drives from the plan page, plus the
  // colour-board PDF allowance/downloads. Without these the BFF answers 403 before
  // the request ever reaches the backend.
  // Points: the only balance. Buying, spending, expiry — and the project-options
  // quote. The wallet and per-item image/project prefixes went with the ledgers
  // behind them; nothing routes there any more.
  "api/billing/points",
  "api/billing/pdf-allowance",
  "api/billing/pdf-downloads",
  "api/organizations",
  "api/access-codes",
  // Retailer kiosk-link updates (create/list live under api/organizations).
  "api/store-links",
  "api/support",
  "api/paint",
  // Public read-only brand/shade catalogue — the portal's "restrict code to
  // brands" picker loads the live brand list through here.
  "api/shades",
] as const;

/** Whether the BFF may forward this backend path. */
export function isBffPathAllowed(path: string): boolean {
  return BFF_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
