"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminApi, authApi, billingApi, guestServerApi, networkApi, HttpError } from "./api";
import type { AdminUserRow, AuditLogRow, DeleteAllShadesResult, ShadeUploadResult, ShopLeadRow, ShopLeadStatus, UploadBrand } from "./api";
import { clientIpFromHeaders } from "./client-ip";
import { config } from "./config";
import type { AuthResponse, AuthUser, NetworkReport, RetailerBrandOption, SubscriptionSummary, WalletRedemption } from "./types";

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

/**
 * The profile fetch's two distinct "no user" cases, kept apart so pages can
 * react differently:
 *  - `user: null, unavailable: false` — genuinely signed out (no token, or the
 *    backend rejected it): redirecting to /sign-in is correct.
 *  - `user: null, unavailable: true` — the user IS signed in but the profile
 *    fetch failed transiently (backend restarting, 5xx, network): treating this
 *    as "signed out" causes phantom sign-out redirects, so callers should show
 *    an error/retry surface instead.
 */
export async function getCurrentUserResult(): Promise<{ user: AuthUser | null; unavailable: boolean }> {
  const token = await getAccessToken();
  if (!token) return { user: null, unavailable: false };
  try {
    return { user: await authApi.profile(token), unavailable: false };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      return { user: null, unavailable: false };
    }
    return { user: null, unavailable: true };
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getCurrentUserResult()).user;
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
  // Forward the real visitor IP so the backend's per-IP login rate limiter buckets
  // by the actual client, not the single frontend-server IP (which would make the
  // limiter one global bucket and lock everyone out). Mirrors registerAction.
  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);
  try {
    const auth = await authApi.login({ email, password }, clientIp);
    // Admin 2FA: the password was right but a code was emailed — no tokens yet.
    // The form re-submits everything plus the code via loginWithOtpAction.
    if (auth.twoFactorRequired) return { otpRequired: true };
    await persistSession(auth);
    await maybeClaimGuestProjects(auth.accessToken);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) return { error: "Incorrect email or password." };
      return { error: err.message };
    }
    // Not an HTTP response at all — the backend is unreachable (restarting or
    // still booting). Say so, instead of a generic failure that reads like
    // wrong credentials and makes people retry blindly.
    return { error: "The server is starting up — please try again in a few seconds." };
  }
  redirect(next);
}

/** Second step of an admin login: same credentials + the emailed 6-digit code. */
export async function loginWithOtpAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (!email || !password || !code) {
    return { error: "Please enter the code from your email." };
  }
  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);
  try {
    const auth = await authApi.loginOtp({ email, password, code }, clientIp);
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) return { error: "Incorrect email or password." };
      return { error: err.message }; // wrong/expired code — backend message says what to do
    }
    return { error: "The server is starting up — please try again in a few seconds." };
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
  const clientIp = clientIpFromHeaders(hdrs);
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

/**
 * The primary walk-in flow: redeem a retailer code with NO login. Any existing
 * session (or guest cookie) is cleared FIRST — redeeming always starts fresh — then
 * the backend auto-provisions a passwordless CUSTOMER account and returns a full
 * session, which we persist as cookies so the customer is signed straight in.
 */
export async function redeemAccountAction(
  code: string,
): Promise<{ name: string; shopName: string } | { error: string }> {
  "use server";
  const value = code.trim();
  if (!value) return { error: "Enter the code from your shop." };

  // Log out whoever is here now (retailer, another customer, a stale guest) before
  // redeeming, so the code's own account is the only session that survives.
  await clearSession();
  const jar = await cookies();
  jar.delete(config.guestCookie);
  jar.delete(config.guestBrandsCookie);

  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);
  try {
    const res = await guestServerApi.redeemAccount(value, clientIp);
    await persistSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      tokenType: "Bearer",
      expiresIn: res.expiresIn,
      user: res.user,
    });
    return { name: res.customerName || res.user.name, shopName: res.shopName };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { error: "That code wasn't found. Check it and try again." };
      if (err.status === 409 || err.status === 410) return { error: "That code has already been used or expired." };
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
  // "customer" → a CUSTOMER-role account (dedicated customer signup page); the shop
  // signup omits this and stays RETAILER.
  const accountType = str("accountType");

  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (password.length < 8) return { error: "Choose a password of at least eight characters." };

  // Real visitor IP (set by the hosting proxy), forwarded so the backend's
  // per-IP signup rate limiter doesn't see every request as the frontend server.
  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);

  try {
    const auth = await authApi.register({ name, email, password, shopName, city, state, phone, tier, accountType }, clientIp);
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

/**
 * Completes Google sign-in. The backend OAuth success handler redirects to
 * /sign-in/callback with the tokens (URL fragment or query string); the callback
 * page reads them client-side and calls this action to persist the same HttpOnly
 * session cookies that email/password login sets.
 *
 * IMPORTANT: this action is invoked imperatively from a `useEffect` (not via a
 * form action or `startTransition`). A `redirect()` here would throw NEXT_REDIRECT
 * which propagates back as a REJECTED promise — the callback's `.catch` would then
 * show "Sign-in failed" even though the cookies were already set. So instead we
 * RETURN the destination and let the client navigate. That was the login bug.
 */
/**
 * Preferred Google-callback path: the backend now redirects with a short-lived
 * single-use code (never the tokens), which we trade server-side for the real
 * pair before setting the session cookies. Throwing on a bad/expired code is
 * fine — the callback page shows its "sign-in failed" state.
 */
export async function completeGoogleSignInWithCode(code: string): Promise<{ next: string }> {
  "use server";
  if (!code) throw new Error("Google sign-in did not return a valid code.");
  const auth = await authApi.exchangeOAuthCode(code);
  return completeGoogleSignIn({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresIn: auth.expiresIn,
  });
}

export async function completeGoogleSignIn(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<{ next: string }> {
  "use server";
  if (!input.accessToken || !input.refreshToken) {
    throw new Error("Google sign-in did not return valid tokens.");
  }
  const jar = await cookies();
  jar.set(config.sessionCookie, input.refreshToken, {
    ...cookieDefaults,
    maxAge: config.refreshTtlSeconds,
  });
  jar.set(config.accessCookie, input.accessToken, {
    ...cookieDefaults,
    maxAge: Math.max(60, input.expiresIn || 0),
  });
  // Fold any active guest session into the freshly signed-in account — parity
  // with the email/password + register flows. Best-effort; never blocks login.
  await maybeClaimGuestProjects(input.accessToken);
  // Honor the page the user started from (stashed before the OAuth hop).
  const requested = jar.get("hv_oauth_next")?.value ?? "";
  const next =
    requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\")
      ? requested
      : "/dashboard";
  jar.delete("hv_oauth_next");
  return { next };
}

/**
 * ADMIN-only: create a shop (retailer) account. The page is already gated by
 * requireRole(["ADMIN"]) and the backend endpoint is ADMIN-only; this carries the
 * admin's access token server-side. Returns a result (no redirect) for inline feedback.
 */
export async function createRetailerAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const password = String(formData.get("password") ?? "");
  const shopName = str("shopName");
  if (!name || !email || !shopName) return { error: "Owner name, email and shop name are required." };
  if (password.length < 8) return { error: "Set an initial password of at least eight characters." };
  try {
    await adminApi.createRetailer(token, {
      name,
      email,
      password,
      shopName,
      city: str("city"),
      state: str("state"),
      phone: str("phone"),
      tier: str("tier"),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not create the shop account. Please try again." };
  }
}

/**
 * ADMIN-only: create a distributor account (+ distributor org). The distributor
 * then provisions their own shops, which land in their downline.
 */
export async function createDistributorAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const password = String(formData.get("password") ?? "");
  const companyName = str("companyName");
  if (!name || !email || !companyName) return { error: "Owner name, email and company name are required." };
  if (password.length < 8) return { error: "Set an initial password of at least eight characters." };
  try {
    await adminApi.createDistributor(token, {
      name,
      email,
      password,
      companyName,
      city: str("city"),
      state: str("state"),
      phone: str("phone"),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not create the distributor account. Please try again." };
  }
}

/**
 * DISTRIBUTOR (or ADMIN): create a shop account through the hierarchy endpoint.
 * A distributor's new shop is auto-linked to their org — it lands in their
 * network report immediately.
 */
export async function createNetworkRetailerAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const password = String(formData.get("password") ?? "");
  const shopName = str("shopName");
  if (!name || !email || !shopName) return { error: "Owner name, email and shop name are required." };
  if (password.length < 8) return { error: "Set an initial password of at least eight characters." };
  try {
    await networkApi.createRetailer(token, {
      name,
      email,
      password,
      shopName,
      city: str("city"),
      state: str("state"),
      phone: str("phone"),
      tier: str("tier"),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      if (err.status === 403) return { error: "Only distributors and admins can create shop accounts." };
      return { error: err.message };
    }
    return { error: "Could not create the shop account. Please try again." };
  }
}

/** RETAILER: create a painter account already linked to the caller's shop. */
export async function createPainterAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Painter name and email are required." };
  if (password.length < 8) return { error: "Set an initial password of at least eight characters." };
  try {
    await networkApi.createPainter(token, { name, email, password, phone: str("phone") });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      if (err.status === 403) return { error: "Only shop (retailer) accounts can create painters." };
      return { error: err.message };
    }
    return { error: "Could not create the painter account. Please try again." };
  }
}

/** Role-scoped network report (tree + totals). NULL on any failure — an outage
 *  must never render as "your network is empty". */
export async function getNetworkReport(): Promise<NetworkReport | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await networkApi.report(token);
  } catch {
    return null;
  }
}

/**
 * DISTRIBUTOR (or ADMIN): every paint brand with a flag for whether the given
 * shop currently has it assigned. Used by the per-shop brand editor.
 */
export async function getRetailerBrandsAction(
  retailerOrgId: string,
): Promise<{ options?: RetailerBrandOption[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await networkApi.retailerBrands(token, retailerOrgId) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "You can only manage shops in your own network." };
      return { error: err.message };
    }
    return { error: "Could not load this shop's brands. Please try again." };
  }
}

/**
 * DISTRIBUTOR (or ADMIN): replace a shop's brand selection wholesale. An empty
 * list clears every restriction (the shop reverts to all brands).
 */
export async function setRetailerBrandsAction(
  retailerOrgId: string,
  brandIds: number[],
): Promise<{ options?: RetailerBrandOption[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await networkApi.setRetailerBrands(token, retailerOrgId, brandIds) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "You can only manage shops in your own network." };
      return { error: err.message };
    }
    return { error: "Could not save the brand selection. Please try again." };
  }
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

/** ADMIN: the shop-account request queue (newest first). NULL on any failure —
 *  never an empty list, which would render an outage as "no requests". */
export async function getShopLeads(): Promise<ShopLeadRow[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listShopLeads(token);
  } catch {
    return null;
  }
}

/** ADMIN: work a lead — mark it contacted / converted / dismissed. */
export async function updateShopLeadStatusAction(
  leadId: string,
  status: ShopLeadStatus,
): Promise<{ lead?: ShopLeadRow; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { lead: await adminApi.updateShopLeadStatus(token, leadId, status) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not update the lead. Please try again." };
  }
}

/** ADMIN: the wallet payout queue (all requests, newest first). NULL on any
 *  failure — this is a money queue, and an expired session or backend outage
 *  must never read as "the queue is clear". */
export async function getWalletRedemptions(): Promise<WalletRedemption[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listWalletRedemptions(token);
  } catch {
    return null;
  }
}

/** ADMIN: settle a payout request — approve (after paying the UPI id) or reject. */
export async function decideWalletRedemptionAction(
  redemptionId: string,
  approve: boolean,
  note?: string,
): Promise<{ redemption?: WalletRedemption; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { redemption: await adminApi.decideWalletRedemption(token, redemptionId, approve, note) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not update the redemption. Please try again." };
  }
}

/** ADMIN: find users by name or email (top 20 matches, newest first). */
export async function searchUsersAction(
  q: string,
): Promise<{ users?: AdminUserRow[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const query = q.trim();
  if (!query) return { users: [] };
  try {
    return { users: await adminApi.searchUsers(token, query) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Search failed. Please try again." };
  }
}

/** ADMIN: a user's active (or most recent) subscription; null when they have none. */
export async function getUserSubscriptionAction(
  userId: string,
): Promise<{ subscription?: SubscriptionSummary | null; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { subscription: await adminApi.getUserSubscription(token, userId) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { subscription: null }; // never had one — not an error
      return { error: err.message };
    }
    return { error: "Could not load the subscription. Please try again." };
  }
}

/** ADMIN: activate a plan for a user without a payment (supersedes any active plan). */
export async function grantSubscriptionAction(
  userId: string,
  input: { plan: string; days: number; aiGenerationsLimit?: number },
): Promise<{ subscription?: SubscriptionSummary; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { subscription: await adminApi.grantSubscription(token, userId, input) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not grant the subscription. Please try again." };
  }
}

/** ADMIN: add AI image-generation credits and/or extend a user's subscription
 *  (extending a lapsed one reactivates it). */
export async function adjustSubscriptionAction(
  userId: string,
  input: { addAiGenerations?: number; extendDays?: number },
): Promise<{ subscription?: SubscriptionSummary; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { subscription: await adminApi.adjustSubscription(token, userId, input) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      if (err.status === 404) return { error: "This user has no subscription yet — grant one first." };
      return { error: err.message };
    }
    return { error: "Could not update the subscription. Please try again." };
  }
}

/** ADMIN: the audit trail (latest 50, optional exact-action filter). NULL on any
 *  failure — never an empty list, which would render an outage as "no records". */
/** How many audit rows one page holds. Kept module-private because a "use server"
 *  file may only export async functions; the client mirror lives in audit-log.tsx. */
const AUDIT_PAGE_SIZE = 50;

export async function getAuditLog(action?: string, page = 0): Promise<AuditLogRow[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listAuditLog(token, action?.trim() || undefined, page, AUDIT_PAGE_SIZE);
  } catch {
    return null;
  }
}

/** ADMIN: companies for the shade-upload dropdown. Empty list on any failure so the
 *  page still renders (an admin can always add a new company). */
export async function getUploadBrands(): Promise<UploadBrand[]> {
  "use server";
  const token = await getAccessToken();
  if (!token) return [];
  try {
    return await adminApi.listUploadBrands(token);
  } catch {
    return [];
  }
}

/** ADMIN: bulk-import a JSON array of shades for an existing or newly named company. */
export async function uploadShadesAction(payload: {
  brandSlug?: string;
  brandName?: string;
  shades: unknown[];
  enrich?: boolean;
}): Promise<{ result?: ShadeUploadResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { result: await adminApi.uploadShades(token, payload) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Upload failed. Please try again." };
  }
}

/**
 * ADMIN: wipe the entire shade catalog (all brands). The backend clears the
 * applied-colour references projects' regions hold and evicts the shade caches;
 * brands themselves are left intact. Destructive and irreversible.
 */
export async function deleteAllShadesAction(): Promise<{ result?: DeleteAllShadesResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { result: await adminApi.deleteAllShades(token) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Delete failed. Please try again." };
  }
}

/**
 * Permanently deletes the signed-in user's account (backend scrubs PII + revokes
 * sessions), then clears the local session and returns home. Invoked from a
 * <form action> so the redirect is handled by the framework (like logout).
 */
export async function deleteAccountAction() {
  "use server";
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) {
    try { await authApi.deleteAccount(access); } catch { /* best-effort; clear the session regardless */ }
  }
  await clearSession();
  redirect("/");
}

/**
 * Subscription guard for subscriber-only pages (e.g. the colour finder). Any
 * ACTIVE subscription — free trial OR paid — passes. A CUSTOMER (who can never
 * hold a shop subscription) is sent to redeem an access code instead of being
 * sold retailer plans; everyone else lands on pricing.
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
  const user = await getCurrentUser();
  if (user?.role === "CUSTOMER") redirect("/redeem");
  // The in-app subscription page shows why access is paused AND the renew
  // buttons — a better landing than the public pricing pitch.
  redirect("/subscription?need=subscription");
}

/**
 * Server-side role guard. Use inside server components to gate pages by role.
 * Redirects to /dashboard with a flash hint if the user lacks the role.
 * If no user is loaded yet, redirects to /sign-in.
 */
export async function requireRole(
  allowed: ReadonlyArray<NonNullable<AuthUser["role"]>>,
): Promise<AuthUser> {
  const { user, unavailable } = await getCurrentUserResult();
  if (!user) {
    // A transient backend failure is NOT "signed out". Redirecting to /sign-in
    // here bounced still-cookied users around like a random sign-out; throwing
    // instead lands on the app error boundary, which offers a Retry.
    if (unavailable) {
      throw new Error("We couldn't reach the server to load your account. Please retry in a moment.");
    }
    redirect("/sign-in");
  }
  if (!allowed.includes(user.role)) redirect("/dashboard?denied=role");
  return user;
}
