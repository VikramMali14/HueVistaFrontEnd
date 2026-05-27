import type { UiTheme, UiVariant } from "./types";

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
  variantCookie: "hv_variant",
  themeCookie: "hv_theme",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
  preferenceTtlSeconds: 60 * 60 * 24 * 365,
  defaultVariant: "premium" as UiVariant,
  defaultTheme: "dark" as UiTheme,
} as const;

export function isVariant(value: unknown): value is UiVariant {
  return value === "premium" || value === "classic";
}
export function isTheme(value: unknown): value is UiTheme {
  return value === "dark" || value === "light";
}
