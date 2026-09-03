"use server";

import { cookies, headers } from "next/headers";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { accessCodeServerApi, adminApi, authApi, billingApi, entitlementApi, kioskServerApi, networkApi, HttpError } from "./api";
import type { SiteAsset } from "./site-assets";
import { SITE_ASSETS_TAG } from "./site-assets-server";
import type { AdminUserRow, AuditLogRow, DataResetResult, DeleteAllShadesResult, DistributorOption, PaymentAttemptRow, PaymentAuditFilters, PaymentAuditSummary, ShadeUploadResult, ShopLeadRow, UploadBrand } from "./api";
import { clientIpFromHeaders } from "./client-ip";
import { config } from "./config";
import { canUseFeature, planWithholds } from "./features";
import type { AdminProjectRow, AppFeatureKey, AuthResponse, AuthUser, MaskLabRequest, MaskLabResult, MaskRegistration, MaskRegistrationResult, MaskReport, MaskReportStatus, MyAccess, NetworkReport, ProjectDetail, RetailerBrandOption, RetailerFeatureOption, SubscriptionSummary } from "./types";

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

/** Whether this browser is holding an unclaimed kiosk purchase. */
export async function hasKioskClaim(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(config.kioskClaimCookie)?.value);
}

/**
 * Right after a user signs in or registers, fold any kiosk purchase this browser is
 * still holding into the account they just used.
 *
 * <p>This is the "add it to my original account" half of the kiosk flow, and it runs
 * automatically because the alternative is worse: the customer signs in, sees none of
 * the work they paid for, and concludes it is lost. The merge moves everything and
 * retires the kiosk account, so afterwards there is exactly one account with
 * everything on it.
 *
 * <p>Best-effort — a failure here must never block the sign-in redirect. The claim
 * cookie is dropped either way: a merge that failed because the kiosk account was
 * already merged would otherwise retry on every future sign-in.
 */
async function maybeMergeKioskAccount(accessToken: string) {
  const jar = await cookies();
  const kioskToken = jar.get(config.kioskClaimCookie)?.value;
  if (!kioskToken) return;
  // Signing back in to the SAME kiosk account is not a merge — it would be an account
  // absorbing itself, which the backend refuses. Nothing to do but keep the claim.
  if (kioskToken === accessToken) return;
  try {
    await kioskServerApi.mergeGuestAccount(accessToken, kioskToken);
  } catch {
    /* best-effort — see above */
  }
  jar.delete(config.kioskClaimCookie);
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
    await maybeMergeKioskAccount(auth.accessToken);
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
 * Kiosk re-entry, step one: ask for a one-time sign-in code by email.
 *
 * <p>This is how a walk-in gets back to what they bought, and deliberately NOT the
 * printed code. A redeemed access code never expires, so a till slip that reopened its
 * account would be a permanent password — one printed on paper, handed across a
 * counter, and impossible to change. Reaching the address the buyer paid with is what
 * proves they are the buyer.
 *
 * <p>The answer is the same whether or not the address bought anything. The backend
 * refuses to say, and the wording here must not give it away either: "if that address
 * has a room, a code is on its way" is the whole of what anyone gets to learn.
 */
export async function requestKioskReentryAction(
  email: string,
): Promise<{ sent: true } | { error: string }> {
  "use server";
  const value = email.trim().toLowerCase();
  if (!value || !value.includes("@")) {
    return { error: "Enter the email address you gave at the shop." };
  }
  const clientIp = clientIpFromHeaders(await headers());
  try {
    await kioskServerApi.requestReentry(value, clientIp);
    return { sent: true };
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      return { error: "Too many requests just now. Wait a minute and try again." };
    }
    return { error: "Could not send the code. Please try again in a moment." };
  }
}

/**
 * Kiosk re-entry, step two: exchange the emailed code for the session on the account
 * the purchase lives on.
 *
 * <p>Whoever is currently signed in is signed out only AFTER the code is accepted. A
 * shop assistant helping a customer at the counter must not lose their own session to
 * a mistyped digit — the same rule the code-redemption path follows, for the same
 * reason.
 */
export async function confirmKioskReentryAction(
  email: string,
  code: string,
): Promise<{ name: string } | { error: string }> {
  "use server";
  const address = email.trim().toLowerCase();
  const value = code.trim();
  if (!address || !value) return { error: "Enter the code from your email." };

  const clientIp = clientIpFromHeaders(await headers());
  try {
    const auth = await kioskServerApi.confirmReentry(address, value, clientIp);
    await clearSession();
    await persistSession(auth);
    return { name: auth.user.name };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not sign you in. Please request a new code." };
  }
}

/**
 * Redeem a shop code onto the account that is ALREADY signed in.
 *
 * This is the ONLY way a counter-issued code is redeemed: onto an account that already
 * exists. There is no longer a route that mints an account from a code alone, and that
 * is deliberate — such an account has no password and, without an address on it,
 * nothing its owner could ever use to get back in. A customer with a shop's slip signs
 * in (or registers) first, then adds the code here.
 *
 * The backend adds the code's allowance to the existing entitlement rather than
 * replacing it, so a second shop's code tops the customer up instead of resetting
 * them, and it refuses outright for a shop/distributor/admin account (whose role the
 * redemption would otherwise destroy).
 */
export async function addCodeToAccountAction(
  code: string,
): Promise<{ shopName: string; projects: number } | { error: string }> {
  "use server";
  const value = code.trim();
  if (!value) return { error: "Enter the code from your shop." };
  const token = await getAccessToken();
  if (!token) {
    return { error: "Your session has expired. Reload this page and try again." };
  }
  try {
    const res = await accessCodeServerApi.redeem(token, value);
    return { shopName: res.organizationName ?? "", projects: res.projectQuota ?? 1 };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { error: "That code wasn't found. Check it and try again." };
      if (err.status === 409 || err.status === 410) {
        // The backend's own wording distinguishes used / cancelled / expired, and a
        // customer at a counter needs to know which of the three they are holding.
        return { error: err.message || "That code has already been used or expired." };
      }
      return { error: err.message };
    }
    return { error: "Could not add that code to your account. Please try again." };
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
    await maybeMergeKioskAccount(auth.accessToken);
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
  await maybeMergeKioskAccount(input.accessToken);
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
      // Blank = the house distributor. No tier is sent: every shop is created
      // free and buys a plan from inside the app if it wants one.
      distributorOrgId: str("distributorOrgId"),
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
  // Access the distributor granted on the form. Absent fields mean "unrestricted",
  // which is what the form submits when its "everything" toggles are left on — so a
  // distributor who ignores the access section still gets today's behaviour.
  const brandsUnrestricted = formData.get("brandsUnrestricted") !== "off";
  const featuresUnrestricted = formData.get("featuresUnrestricted") !== "off";
  const brandIds = formData
    .getAll("brandIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  const features = formData.getAll("features").map((v) => String(v));

  try {
    await networkApi.createRetailer(token, {
      name,
      email,
      password,
      shopName,
      city: str("city"),
      state: str("state"),
      phone: str("phone"),
      brandsUnrestricted,
      brandIds: brandsUnrestricted ? [] : brandIds,
      featuresUnrestricted,
      features: featuresUnrestricted ? [] : features,
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
 * DISTRIBUTOR (or ADMIN): replace a shop's brand selection wholesale.
 *
 * `unrestricted` is the caller's explicit "give them everything" — it is NOT the
 * same as passing no brand ids, which really does revoke every company.
 */
export async function setRetailerBrandsAction(
  retailerOrgId: string,
  brandIds: number[],
  unrestricted: boolean,
): Promise<{ options?: RetailerBrandOption[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await networkApi.setRetailerBrands(token, retailerOrgId, brandIds, unrestricted) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "You can only manage shops in your own network." };
      return { error: err.message };
    }
    return { error: "Could not save the brand selection. Please try again." };
  }
}

/**
 * DISTRIBUTOR (or ADMIN): the brands and pages available to grant, nothing assigned.
 *
 * Feeds the shop-creation form's checklists. Returns empty lists on failure so the
 * form still renders and creates an (unrestricted) shop — losing the ability to
 * narrow access is a far better failure than not being able to create a shop.
 */
export async function getGrantableAccessAction(): Promise<{
  brands: RetailerBrandOption[];
  features: RetailerFeatureOption[];
}> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { brands: [], features: [] };
  try {
    return await networkApi.grantable(token);
  } catch {
    return { brands: [], features: [] };
  }
}

/** DISTRIBUTOR (or ADMIN): every grantable page for a shop, with its current state. */
export async function getRetailerFeaturesAction(
  retailerOrgId: string,
): Promise<{ options?: RetailerFeatureOption[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await networkApi.retailerFeatures(token, retailerOrgId) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "You can only manage shops in your own network." };
      return { error: err.message };
    }
    return { error: "Could not load this shop's pages. Please try again." };
  }
}

/**
 * DISTRIBUTOR (or ADMIN): replace a shop's page selection wholesale. Same
 * three-state contract as {@link setRetailerBrandsAction}.
 */
export async function setRetailerFeaturesAction(
  retailerOrgId: string,
  features: string[],
  unrestricted: boolean,
): Promise<{ options?: RetailerFeatureOption[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await networkApi.setRetailerFeatures(token, retailerOrgId, features, unrestricted) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "You can only manage shops in your own network." };
      return { error: err.message };
    }
    return { error: "Could not save the page selection. Please try again." };
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

/**
 * ADMIN: create the account a verified request asked for — the one-click path.
 * Everything comes off the request itself; the only decision is which
 * distributor the shop belongs under (omitted = the house one).
 */
export async function approveShopLeadAction(
  leadId: string,
  distributorOrgId?: string,
): Promise<{ lead?: ShopLeadRow; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { lead: await adminApi.approveShopLead(token, leadId, distributorOrgId || undefined) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: err.message };
      return { error: err.message };
    }
    return { error: "Could not create the account. Please try again." };
  }
}

/**
 * ADMIN: the "the AI got this wrong" queue, newest first.
 *
 * NULL on any failure rather than an empty list — the two mean opposite things
 * here, and rendering an outage as "no reports" would be the worst possible lie
 * to tell about a queue whose entire job is to surface silent failures.
 */
export async function getMaskReports(includeResolved = false): Promise<MaskReport[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listMaskReports(token, includeResolved);
  } catch {
    return null;
  }
}

/** ADMIN: move a report along and/or leave an internal note. */
export async function updateMaskReportAction(
  reportId: string,
  body: { status?: MaskReportStatus; adminNote?: string },
): Promise<{ report?: MaskReport; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { report: await adminApi.updateMaskReport(token, reportId, body) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not update the report. Please try again." };
  }
}

/**
 * ADMIN: every room on the platform, for the mask viewer's picker.
 *
 * NULL on failure, empty array for "nothing matched" — the picker says something
 * different for each, and an outage rendered as "no rooms" would send an admin looking
 * for a room that is actually right there.
 */
export async function searchAllProjectsAction(
  q = "",
): Promise<{ rows?: AdminProjectRow[]; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { rows: await adminApi.listAllProjects(token, q) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not load the rooms. Please try again." };
  }
}

/**
 * ADMIN: one room's full detail, whoever owns it.
 *
 * Goes through a server action rather than the BFF because the BFF's allow-list
 * deliberately does not carry `api/admin` — opening that prefix to the browser would
 * expose the whole admin surface to it, for the sake of one diagnostics screen.
 */
export async function loadAdminProjectAction(
  projectId: string,
): Promise<{ project?: ProjectDetail; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { project: await adminApi.getProject(token, projectId) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not open that room. Please try again." };
  }
}

/**
 * ADMIN: where somebody last hand-placed this room's masks, or null when nobody
 * has — which is nearly every room, and tells the bench to open on the mask as
 * the automatic fit left it rather than on an earlier session.
 */
export async function loadMaskRegistrationAction(
  projectId: string,
): Promise<{ registration?: MaskRegistration | null; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { registration: (await adminApi.getMaskRegistration(token, projectId)) ?? null };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not read this room's registration. Please try again." };
  }
}

/**
 * ADMIN: put this room's detected masks where the bench says they belong.
 *
 * Re-splits the stored colour-coded mask and re-lands each surface — region rows,
 * ids, labels and applied colours all survive, hand-drawn walls are left alone,
 * and nothing here spends a credit or runs a model.
 *
 * The backend's own message is passed straight through on failure. Every refusal
 * it makes says something specific and actionable ("the trim mask keeps only 900
 * pixels — it has been pushed off the canvas"), and replacing that with a house
 * string would throw away the one thing the person needs to fix their placement.
 */
export async function applyMaskRegistrationAction(
  projectId: string,
  registration: MaskRegistration,
): Promise<{ result?: MaskRegistrationResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { result: await adminApi.applyMaskRegistration(token, projectId, registration) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not apply the registration. Please try again." };
  }
}

/**
 * ADMIN: run one uploaded photo through one way of producing a mask.
 *
 * Writes to no project and spends no credit — the lab exists so the approaches
 * can be compared on a real facade before anything in the pipeline changes.
 *
 * The backend's own message is passed straight through on failure. Every refusal
 * it makes is specific and actionable ("the body has no {{image}} placeholder",
 * "that model is not in the catalogue"), and replacing those with a house string
 * would throw away the one thing the person needs to fix their run.
 */
export async function runMaskLabAction(
  formData: FormData,
): Promise<{ result?: MaskLabResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const file = formData.get("file");
  const raw = formData.get("request");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a cleaned image to run against." };
  }
  if (typeof raw !== "string") return { error: "The run settings were missing." };
  let request: MaskLabRequest;
  try {
    request = JSON.parse(raw) as MaskLabRequest;
  } catch {
    return { error: "The run settings could not be read." };
  }
  try {
    return { result: await adminApi.runMaskLab(token, file, request) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "That run could not be started. Please try again." };
  }
}

/** ADMIN: turn a request down. Nothing is created and the stored hash is dropped. */
export async function dismissShopLeadAction(
  leadId: string,
): Promise<{ lead?: ShopLeadRow; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { lead: await adminApi.dismissShopLead(token, leadId) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not dismiss the request. Please try again." };
  }
}

/**
 * ADMIN: the distributors a shop can be filed under, house org first. NULL on
 * failure so the form can say the picker is unavailable rather than silently
 * offering nothing and filing every shop under the house distributor.
 */
export async function getDistributorOptions(): Promise<DistributorOption[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listDistributors(token);
  } catch {
    return null;
  }
}

/* ── Marketing-site images ───────────────────────────────────────────────
   The slot registry lives in lib/site-assets.ts; these three just move files.
   Each write busts the cached manifest, so the admin sees the new picture on
   the live page immediately rather than up to an hour later — an editor who
   cannot tell whether their change landed will upload it again. */

/** ADMIN: every slot that currently holds an image. Null when unreachable. */
export async function listSiteAssetsAction(): Promise<SiteAsset[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listSiteAssets(token);
  } catch {
    return null;
  }
}

/** ADMIN: put an uploaded image in a slot, replacing whatever it held. */
export async function putSiteAssetAction(
  slot: string,
  formData: FormData,
): Promise<{ asset?: SiteAsset; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  try {
    const asset = await adminApi.putSiteAsset(token, slot, file);
    updateTag(SITE_ASSETS_TAG);
    return { asset };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not upload that image. Please try again." };
  }
}

/** ADMIN: empty a slot so the page draws its built-in default again. */
export async function clearSiteAssetAction(slot: string): Promise<{ error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    await adminApi.clearSiteAsset(token, slot);
    updateTag(SITE_ASSETS_TAG);
    return {};
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not clear that slot. Please try again." };
  }
}

/** The same list, in the result shape the network editors use. */
export async function listDistributorsAction(): Promise<{
  options?: DistributorOption[];
  error?: string;
}> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { options: await adminApi.listDistributors(token) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not load the distributors. Please try again." };
  }
}

/**
 * ADMIN: move a shop to another distributor — blank means the house one.
 *
 * The previous distributor's brand and page grants are cleared server-side: they
 * were that distributor's to make, and a restriction whose author no longer
 * supplies the shop is one nobody can lift.
 */
export async function moveShopDistributorAction(
  retailerOrgId: string,
  distributorOrgId?: string,
): Promise<{ ok?: true; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    await adminApi.moveRetailer(token, retailerOrgId, distributorOrgId || undefined);
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not move the shop. Please try again." };
  }
}

/** ADMIN: the wallet payout queue (all requests, newest first). NULL on any
 *  failure — this is a money queue, and an expired session or backend outage
 *  must never read as "the queue is clear". */
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
  input: { plan: string; days: number; projectsLimit?: number },
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

/** ADMIN: grant extra project credits and/or extend a user's subscription
 *  (extending a lapsed one reactivates it). */
export async function adjustSubscriptionAction(
  userId: string,
  input: { addProjects?: number; extendDays?: number },
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

/** Rows per page in the payment audit. The client mirror lives in payment-audit.tsx —
 *  a "use server" file may only export async functions, so it can't be shared. */
const PAYMENT_AUDIT_PAGE_SIZE = 50;

/**
 * ADMIN: the payment audit — every checkout opened, whether or not it was paid.
 *
 * NULL on any failure, never an empty list: rendering an outage as "no payment problems
 * recorded" is precisely the wrong answer for a report someone opens because they suspect
 * a payment problem.
 */
export async function getPaymentAttempts(
  filters: PaymentAuditFilters = {},
  page = 0,
): Promise<PaymentAttemptRow[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listPaymentAttempts(token, filters, page, PAYMENT_AUDIT_PAGE_SIZE);
  } catch {
    return null;
  }
}

/** ADMIN: headline counts for the payment audit. NULL on failure, for the same reason. */
export async function getPaymentAuditSummary(days = 30): Promise<PaymentAuditSummary | null> {
  "use server";
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.paymentAuditSummary(token, days);
  } catch {
    return null;
  }
}

/** ADMIN: every checkout one account opened — for working a single support ticket. */
export async function getUserPaymentAttempts(userId: string): Promise<PaymentAttemptRow[] | null> {
  "use server";
  const token = await getAccessToken();
  if (!token || !userId.trim()) return null;
  try {
    return await adminApi.listUserPaymentAttempts(token, userId.trim());
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
 * ADMIN: what a platform reset would clear and keep, with live row counts. Read-only,
 * so the confirmation screen can show real numbers before anything is destroyed.
 */
export async function previewDataResetAction(): Promise<{ result?: DataResetResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { result: await adminApi.previewDataReset(token) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not read the current data. Please try again." };
  }
}

/**
 * ADMIN: wipe every account, shop, project, subscription and payment on the platform.
 * The paint catalogue (companies, product lines, shades) is kept, as is your own admin
 * account — so you stay signed in. Destructive and irreversible.
 *
 * `deleteImageFiles` also empties the image store (S3 bucket or upload directory). Those
 * files are unreachable once the rows naming them are gone, but unlike the rows they
 * cannot be brought back by a database snapshot — hence the separate choice.
 */
export async function resetPlatformDataAction(
  confirmation: string,
  deleteImageFiles: boolean,
): Promise<{ result?: DataResetResult; error?: string }> {
  "use server";
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { result: await adminApi.resetPlatformData(token, confirmation, deleteImageFiles) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Reset failed. Please try again." };
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
 * ACTIVE subscription — free trial OR paid — passes, as does an account the platform
 * does not bill. A CUSTOMER (who can never hold a shop subscription) is sent to unlock
 * with an access code or buy a project; everyone else lands on pricing.
 */
export async function requireActiveSubscription(): Promise<void> {
  const token = await getAccessToken();
  if (!token) redirect("/sign-in");

  // An administrator holds no subscription and is not meant to. Checked BEFORE the
  // lookup rather than relying on what it answers: this guard fronts pages an admin
  // must always be able to open, and it should not depend on a billing call — which
  // for years answered 404 here and bounced them to a page selling them their own
  // product — nor break again if that call is unreachable.
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") return;

  try {
    const sub = await billingApi.currentSubscription(token);
    if (sub?.unbilled || sub?.status === "ACTIVE") return;
  } catch {
    /* 404 = no subscription → fall through to the redirect below */
  }
  if (user?.role === "CUSTOMER") redirect("/unlock");
  // The in-app subscription page shows why access is paused AND the renew
  // buttons — a better landing than the public pricing pitch.
  redirect("/plan?need=subscription");
}

/**
 * The signed-in caller's brand + page allowances, or null when there is no session
 * (or the backend can't be reached).
 *
 * A null result must be read as "don't know", never as "denied": the callers below
 * deliberately fail OPEN on it. A backend hiccup should not lock a paying shop out
 * of pages its distributor granted — the backend enforces the same rules on every
 * endpoint behind these pages, so the worst case of failing open is a nav tab that
 * leads to a 403, not actual unauthorised access.
 */
export async function getMyAccess(): Promise<MyAccess | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await networkApi.myAccess(token);
  } catch {
    return null;
  }
}

/**
 * Whether a paint shop stands behind this account — an entitlement from a redeemed
 * access code.
 *
 * The dividing line between the two kinds of customer, and the backend draws it the
 * same way (CustomerEntitlementService#hasEntitlement). One kind was onboarded by a
 * shop: their projects came out of that shop's quota, the shop assigned them products,
 * and the shop can give them more. The other signed up alone — with Google, or an
 * email address — and has none of that: no shop to ask, no products assigned, and
 * buying is the only way they get a project.
 *
 * False for every non-customer, who have no entitlement by construction, and false on
 * any failure. Failing closed is right here because the only thing this decides is
 * whether to show a tab that would otherwise 404: the cost of being wrong is one
 * missing tab, against a page that can only tell the visitor it has nothing for them.
 */
export async function customerHasShop(): Promise<boolean> {
  return (await customerShopStatus()) === "linked";
}

/**
 * The same question, keeping "we could not tell" apart from "no".
 *
 * `customerHasShop` folds a failure into `false`, which is right for the nav: the
 * cost of being wrong there is one missing tab. It is NOT right for a page guard.
 * /assigned-products now turns a shopless customer away, and a guard built on the
 * folded answer would read a backend blip as "this account has no shop" and evict a
 * customer who is entitled to the page — with a banner confidently telling them to go
 * and find a code they already redeemed.
 *
 * So the three states stay three. Only a definite `none` — the endpoint answered, and
 * answered with no entitlement — closes the page. `unknown` leaves it open and lets
 * the view behind it report the failure, which is the same way `requireRole` treats
 * an account it could not load.
 *
 * `== null` rather than `=== null`, deliberately: the backend says "no entitlement"
 * with an empty 200 body, which reaches us as `undefined`. A strict test against
 * `null` therefore answered "linked" for every shopless customer alive — the tab
 * appeared, the page opened, and the fetch behind it 404'd. `entitlementApi.my` now
 * normalises that, and this stays loose so a second empty can never mean "yes".
 */
export async function customerShopStatus(): Promise<"linked" | "none" | "unknown"> {
  const token = await getAccessToken();
  if (!token) return "unknown";
  try {
    return (await entitlementApi.my(token)) != null ? "linked" : "none";
  } catch {
    return "unknown";
  }
}

/**
 * Server-side page guard for a distributor-grantable page. Use inside server
 * components alongside the existing role/subscription guards.
 *
 * A shop that lands here without the grant goes to its dashboard with a hint,
 * rather than to sign-in — they are correctly signed in, they just don't have
 * this page, and only their distributor can change that.
 */
export async function requireFeature(feature: AppFeatureKey): Promise<void> {
  const access = await getMyAccess();
  // Which denial it is decides what the dashboard says next. A distributor grant is
  // somebody else's decision and the shop has to ring them; a plan limit is the shop's
  // own and the subscribe button lifts it. Sending the second case to the distributor
  // would point a free shop at someone who cannot help.
  if (planWithholds(access, feature)) {
    redirect(`/dashboard?denied=plan&page=${encodeURIComponent(feature)}`);
  }
  if (!canUseFeature(access, feature)) {
    redirect(`/dashboard?denied=feature&page=${encodeURIComponent(feature)}`);
  }
}

/**
 * The same guard, for a page that would rather be SHOWN LOCKED than vanish.
 *
 * The two ways a page closes want opposite treatment, and `requireFeature` bounces
 * on both. A DISTRIBUTOR withholding a page is somebody else's decision: there is
 * nothing on the page that could lift it, so it stays a bounce with a hint to go and
 * ring them. A shop's own PLAN withholding it is the shop's decision to reverse in
 * two clicks — and bouncing them to a dashboard hint meant the one page that could
 * explain what they were missing was the one page they were never allowed to see.
 * So the plan case opens the page and lets it make its own case.
 *
 * Returns `{ planLocked: true }` for that case; the page is expected to render its
 * real chrome and refuse the actual work. Not a security boundary in either
 * direction — the backend enforces the same rule on the endpoints behind the page,
 * which is what makes it safe to render the shell at all.
 */
export async function requireFeatureOrLock(
  feature: AppFeatureKey,
): Promise<{ planLocked: boolean }> {
  const access = await getMyAccess();
  if (planWithholds(access, feature)) return { planLocked: true };
  if (!canUseFeature(access, feature)) {
    redirect(`/dashboard?denied=feature&page=${encodeURIComponent(feature)}`);
  }
  return { planLocked: false };
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
  // Carry WHICH roles the page wanted. The message was a fixed sentence naming
  // retailers and administrators, so a retailer bounced off an admin-only page was
  // told the page is for retailers — a denial that contradicts itself reads as a
  // bug in the app rather than a rule about the page.
  if (!allowed.includes(user.role)) {
    redirect(`/dashboard?denied=role&need=${encodeURIComponent(allowed.join(","))}`);
  }
  return user;
}
