export const config = {
  apiOrigin:
    process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ??
    "http://localhost:8080",
  internalApiOrigin:
    process.env.API_INTERNAL_ORIGIN?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ??
    "http://localhost:8080",
  sessionCookie: "hv_refresh",
  accessCookie: "hv_access",
  // Anonymous guest token (redeemed a shop access code, no account). Scopes the
  // /api/guest/* endpoints. Lives only as long as the code is valid.
  guestCookie: "hv_guest",
  // Paint companies the shop unlocked for the current guest (JSON array of brand
  // names). UX-only filter — the guest never sees shade codes regardless. Set
  // alongside the guest token at redeem time; empty/absent means "all brands".
  guestBrandsCookie: "hv_guest_brands",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
} as const;
