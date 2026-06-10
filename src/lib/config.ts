import type { UiTheme } from "./types";

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
  themeCookie: "hv_theme",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
  preferenceTtlSeconds: 60 * 60 * 24 * 365,
  defaultTheme: "dark" as UiTheme,
} as const;

export function isTheme(value: unknown): value is UiTheme {
  return value === "dark" || value === "light";
}
