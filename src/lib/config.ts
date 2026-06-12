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
  refreshTtlSeconds: 60 * 60 * 24 * 7,
} as const;
