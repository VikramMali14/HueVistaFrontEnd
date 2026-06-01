"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authApi, HttpError } from "./api";
import { config, isLocale, isTheme, isVariant } from "./config";
import type { AuthResponse, AuthUser, UiLocale, UiTheme, UiVariant } from "./types";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// Preference cookies (variant, theme) are readable by no one but the server too,
// but they outlive the session — pinned to the long preferenceTtl.
const preferenceCookieDefaults = {
  ...cookieDefaults,
  maxAge: config.preferenceTtlSeconds,
};

// Dev-only auth bypass. Gated on both NODE_ENV !== "production" AND the explicit env var
// so a stray DEV_BYPASS_AUTH=1 in prod still cannot activate. Backend calls
// (image upload, profile refresh) will fail under bypass; only UI flows that read
// from local sample data work without a running backend.
function isDevBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1";
}

const DEV_BYPASS_TOKEN = "dev-bypass-token";
const DEV_BYPASS_USER: AuthUser = {
  id: "dev-bypass",
  name: "Test Retailer",
  email: "test@huevista.dev",
  provider: "LOCAL",
  role: "RETAILER",
};

async function persistSession(auth: AuthResponse) {
  const jar = await cookies();
  jar.set(config.sessionCookie, auth.refreshToken, {
    ...cookieDefaults,
    maxAge: config.refreshTtlSeconds,
  });
  jar.set(config.accessCookie, auth.accessToken, {
    ...cookieDefaults,
    maxAge: Math.max(60, auth.expiresIn),
  });
  // Variant and theme are user-chosen — keep any existing cookie (which may be a local
  // toggle the user set before signing in) and otherwise seed from the backend profile.
  if (!jar.get(config.variantCookie)) {
    const variant = isVariant(auth.user.uiVariant) ? auth.user.uiVariant : config.defaultVariant;
    jar.set(config.variantCookie, variant, preferenceCookieDefaults);
  }
  if (!jar.get(config.themeCookie)) {
    const theme = isTheme(auth.user.uiTheme) ? auth.user.uiTheme : config.defaultTheme;
    jar.set(config.themeCookie, theme, preferenceCookieDefaults);
  }
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(config.sessionCookie);
  jar.delete(config.accessCookie);
  jar.delete(config.variantCookie);
  // hv_theme is intentionally NOT cleared — a user's preferred theme should survive logout.
}

export async function getUiVariant(): Promise<UiVariant> {
  const jar = await cookies();
  const value = jar.get(config.variantCookie)?.value;
  return isVariant(value) ? value : config.defaultVariant;
}

export async function getUiTheme(): Promise<UiTheme> {
  const jar = await cookies();
  const value = jar.get(config.themeCookie)?.value;
  return isTheme(value) ? value : config.defaultTheme;
}

export async function getUiLocale(): Promise<UiLocale> {
  const jar = await cookies();
  const value = jar.get(config.localeCookie)?.value;
  return isLocale(value) ? value : config.defaultLocale;
}

export async function setUiThemeAction(theme: UiTheme) {
  "use server";
  if (!isTheme(theme)) return;
  const jar = await cookies();
  jar.set(config.themeCookie, theme, preferenceCookieDefaults);
  revalidatePath("/", "layout");
}

export async function toggleUiThemeAction() {
  "use server";
  const current = await getUiTheme();
  const next: UiTheme = current === "dark" ? "light" : "dark";
  const jar = await cookies();
  jar.set(config.themeCookie, next, preferenceCookieDefaults);
  revalidatePath("/", "layout");
}

export async function toggleUiVariantAction() {
  "use server";
  const current = await getUiVariant();
  const next: UiVariant = current === "premium" ? "classic" : "premium";
  const jar = await cookies();
  jar.set(config.variantCookie, next, preferenceCookieDefaults);
  revalidatePath("/", "layout");
}

export async function toggleUiLocaleAction() {
  "use server";
  const current = await getUiLocale();
  const next: UiLocale = current === "en" ? "hi" : "en";
  const jar = await cookies();
  jar.set(config.localeCookie, next, preferenceCookieDefaults);
  revalidatePath("/", "layout");
}

export async function getAccessToken(): Promise<string | null> {
  if (isDevBypass()) return DEV_BYPASS_TOKEN;
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) return access;
  const refresh = jar.get(config.sessionCookie)?.value;
  if (!refresh) return null;
  try {
    const auth = await authApi.refresh(refresh);
    await persistSession(auth);
    return auth.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}

export async function requireAccessToken(): Promise<string> {
  if (isDevBypass()) return DEV_BYPASS_TOKEN;
  const token = await getAccessToken();
  if (!token) redirect("/sign-in");
  return token;
}

/**
 * Lightweight, render-safe check for whether a session exists. Only READS the
 * refresh cookie (7-day TTL) — never refreshes or mutates cookies — so it is
 * safe to call from any Server Component (e.g. the public site header) without
 * a backend round-trip. Use this for "is the visitor signed in?" UI decisions;
 * use getCurrentUser() when you actually need the profile.
 */
export async function hasSession(): Promise<boolean> {
  if (isDevBypass()) return true;
  const jar = await cookies();
  return Boolean(jar.get(config.sessionCookie)?.value);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isDevBypass()) return DEV_BYPASS_USER;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await authApi.profile(token);
  } catch {
    return null;
  }
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Please enter your email and passphrase." };
  }
  try {
    const auth = await authApi.login({ email, password });
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) return { error: "Incorrect email or passphrase." };
      return { error: err.message };
    }
    return { error: "Could not sign in. Please try again." };
  }
  redirect(next);
}

export async function registerAction(formData: FormData) {
  "use server";
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = [firstName, lastName].filter(Boolean).join(" ");

  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (password.length < 8) return { error: "Choose a passphrase of at least eight characters." };

  try {
    const auth = await authApi.register({ name, email, password });
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      return { error: err.message };
    }
    return { error: "Could not create the account. Please try again." };
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  "use server";
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) {
    try { await authApi.logout(access); } catch { /* ignore */ }
  }
  await clearSession();
  redirect("/");
}

/**
 * Server-side role guard. Use inside server components to gate pages by role.
 * Redirects to /dashboard with a flash hint if the user lacks the role.
 * If no user is loaded yet, redirects to /sign-in.
 */
export async function requireRole(
  allowed: ReadonlyArray<NonNullable<AuthUser["role"]>>,
): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!allowed.includes(user.role)) redirect("/dashboard?denied=role");
  return user;
}
