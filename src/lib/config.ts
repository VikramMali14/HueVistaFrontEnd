import type { UiLocale, UiTheme, UiVariant } from "./types";

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
  variantCookie: "hv_variant",
  themeCookie: "hv_theme",
  localeCookie: "hv_locale",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
  preferenceTtlSeconds: 60 * 60 * 24 * 365,
  defaultVariant: "premium" as UiVariant,
  defaultTheme: "dark" as UiTheme,
  defaultLocale: "en" as UiLocale,
} as const;

export function isVariant(value: unknown): value is UiVariant {
  return value === "premium" || value === "classic";
}
export function isTheme(value: unknown): value is UiTheme {
  return value === "dark" || value === "light";
}
export function isLocale(value: unknown): value is UiLocale {
  return value === "en" || value === "hi";
}
