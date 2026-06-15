"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authApi, billingApi, guestServerApi, HttpError } from "./api";
import { config } from "./config";
import type { AuthResponse, AuthUser } from "./types";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
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
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(config.sessionCookie);
  jar.delete(config.accessCookie);
}

/** Whether an anonymous guest session (redeemed shop code) is active. */
export async function hasGuestSession(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(config.guestCookie)?.value);
}

/**
 * Right after a user signs in/up, fold any active guest session into their
 * account: re-point the guest's projects to the new user, then drop the guest
 * cookie. Best-effort — a failure here must never block the auth redirect.
 */
async function maybeClaimGuestProjects(accessToken: string) {
  const jar = await cookies();
  const guestToken = jar.get(config.guestCookie)?.value;
  if (!guestToken) return;
  try {
    await guestServerApi.claim(accessToken, guestToken);
  } catch {
    /* best-effort */
  }
  jar.delete(config.guestCookie);
  jar.delete(config.guestBrandsCookie);
}

export async function getAccessToken(): Promise<string | null> {
  // READ-ONLY. Token refresh (and the cookie writes it needs) happens in
  // middleware.ts, which runs before render where cookies ARE writable. A Server
  // Component / Route Handler must never mutate cookies during render — doing so
  // throws "Cookies can only be modified in a Server Action or Route Handler".
  const jar = await cookies();
  return jar.get(config.accessCookie)?.value ?? null;
}

export async function requireAccessToken(): Promise<string> {
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
  const jar = await cookies();
  return Boolean(jar.get(config.sessionCookie)?.value);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await authApi.profile(token);
  } catch {
    return null;
  }
}

/** Open-redirect guard: only allow same-origin relative paths (start with a
 *  single "/", not "//" or "/\\" which browsers treat as protocol-relative). */
function safeNext(raw: FormDataEntryValue | null, fallback = "/dashboard"): string {
  const next = typeof raw === "string" ? raw.trim() : "";
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return fallback;
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }
  try {
    const auth = await authApi.login({ email, password });
    await persistSession(auth);
    await maybeClaimGuestProjects(auth.accessToken);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) return { error: "Incorrect email or password." };
      return { error: err.message };
    }
    return { error: "Could not sign in. Please try again." };
  }
  redirect(next);
}

/**
 * Public, anonymous guest redemption of a shop access code. Stores the guest
 * token in an httpOnly cookie (valid until the code expires) and returns the shop
 * context for the "continue as guest / sign in to save" choice screen.
 */
export async function redeemGuestAction(
  code: string,
): Promise<{ shopName: string; code: string; validDays: number } | { error: string }> {
  "use server";
  const value = code.trim();
  if (!value) return { error: "Enter the code from your shop." };
  const hdrs = await headers();
  const clientIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip")?.trim() || undefined;
  try {
    const res = await guestServerApi.redeem(value, clientIp);
    const jar = await cookies();
    const ttlSeconds = Math.max(60, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
    jar.set(config.guestCookie, res.guestToken, { ...cookieDefaults, maxAge: ttlSeconds });
    if (res.allowedBrands && res.allowedBrands.length > 0) {
      jar.set(config.guestBrandsCookie, JSON.stringify(res.allowedBrands), { ...cookieDefaults, maxAge: ttlSeconds });
    } else {
      jar.delete(config.guestBrandsCookie); // no restriction → every brand
    }
    return { shopName: res.shopName, code: res.code, validDays: res.validDays };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { error: "That code wasn't found. Check it and try again." };
      if (err.status === 409) return { error: "That code has already been used." };
      return { error: err.message };
    }
    return { error: "Could not redeem that code. Please try again." };
  }
}

export async function registerAction(formData: FormData) {
  "use server";
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const next = safeNext(formData.get("next"));
  // Retailer trial-signup context (the trial form collects these; a plain register omits them).
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const shopName = str("shopName");
  const city = str("city");
  const state = str("state");
  const phone = str("phone");
  const tier = str("tier");

  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (password.length < 8) return { error: "Choose a password of at least eight characters." };

  // Real visitor IP (set by the hosting proxy), forwarded so the backend's
  // per-IP signup rate limiter doesn't see every request as the frontend server.
  const hdrs = await headers();
  const clientIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    undefined;

  try {
    const auth = await authApi.register({ name, email, password, shopName, city, state, phone, tier }, clientIp);
    await persistSession(auth);
    await maybeClaimGuestProjects(auth.accessToken);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      if (err.status === 429) return { error: err.message };
      return { error: err.message };
    }
    return { error: "Could not create the account. Please try again." };
  }
  redirect(next);
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
 * Subscription guard for subscriber-only pages (e.g. the colour finder). Any
 * ACTIVE subscription — free trial OR paid — passes. Anything else (no
 * subscription, a lapsed one, or a customer who only has an access-code
 * entitlement) is sent to pricing. Use inside server components.
 */
export async function requireActiveSubscription(): Promise<void> {
  const token = await getAccessToken();
  if (!token) redirect("/sign-in");
  try {
    const sub = await billingApi.currentSubscription(token);
    if (sub?.status === "ACTIVE") return;
  } catch {
    /* 404 = no subscription → fall through to the redirect below */
  }
  redirect("/pricing?need=subscription");
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
