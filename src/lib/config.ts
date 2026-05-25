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
  refreshTtlSeconds: 60 * 60 * 24 * 7,
} as const;
