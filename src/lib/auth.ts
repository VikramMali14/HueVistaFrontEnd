"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, HttpError } from "./api";
import { config, isTheme, isVariant } from "./config";
import type { AuthResponse, AuthUser, UiTheme, UiVariant } from "./types";

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
  // Pin the user's UI variant on every successful auth so subsequent server-side
  // renders pick the right look without needing a profile round-trip.
  const variant = isVariant(auth.user.uiVariant) ? auth.user.uiVariant : config.defaultVariant;
  jar.set(config.variantCookie, variant, preferenceCookieDefaults);
  // Theme is user-chosen — keep the existing cookie if there is one, otherwise seed it
  // from the user's saved preference (server-returned) or the default.
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

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) return access;
  const refresh = jar.get(config.sessionCookie)?.value;
  if (!refresh) return null;
  try {
    const auth = await api.refresh(refresh);
    await persistSession(auth);
    return auth.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect("/sign-in");
  return token;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await api.profile(token);
  } catch {
    return null;
  }
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/atelier");

  if (!email || !password) {
    return { error: "Please enter your email and passphrase." };
  }
  try {
    const auth = await api.login({ email, password });
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
    const auth = await api.register({ name, email, password });
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      return { error: err.message };
    }
    return { error: "Could not create the account. Please try again." };
  }
  redirect("/atelier");
}

export async function logoutAction() {
  "use server";
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) {
    try { await api.logout(access); } catch { /* ignore */ }
  }
  await clearSession();
  redirect("/");
}
