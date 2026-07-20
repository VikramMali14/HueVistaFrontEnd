/**
 * Typed API client for the HueVista backend.
 *
 * Two flavours:
 *  - `serverFetch` for use inside server actions (auth flows). Talks directly
 *    to the backend with the access token read server-side from cookies.
 *  - `browserFetch` for client components. Calls `/bff/*` on the same origin;
 *    the BFF route attaches the Authorization header from the HttpOnly cookie,
 *    so the access token NEVER reaches the browser bundle. This preserves the
 *    security guarantee that the token can't be read by client-side JS.
 */

import { config } from "./config";
import { HttpError } from "./http-error";
import { isDemoMode } from "./demo/flag";
import type {
  AccessCode,
  ApiError,
  AuthResponse,
  CustomerEntitlement,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProductCategory,
  ProjectCreditOrder,
  QualityTier,
  ShopProduct,
  ProjectDetail,
  ProjectSummary,
  RegionColorUpdate,
  RegionDetail,
  SegmentationOptions,
  SupportConversation,
  SupportConversationSummary,
  UploadedImage,
  UserProfile,
  VerificationStatus,
} from "./types";

async function parseError(res: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* not JSON */
  }
  const obj = (payload ?? {}) as Record<string, unknown>;
  const message =
    typeof obj.message === "string"
      ? obj.message
      : typeof obj.error === "string"
        ? obj.error
        : res.statusText || "Request failed";
  const fieldErrors =
    typeof obj.fieldErrors === "object" && obj.fieldErrors !== null
      ? (obj.fieldErrors as Record<string, string>)
      : undefined;
  const code = typeof obj.code === "string" ? obj.code : undefined;
  return { status: res.status, message, fieldErrors, code };
}

/**
 * Client-side fetch through the BFF proxy. `path` must be the underlying backend
 * path (e.g. "api/images/upload"); we prefix `/bff/` so the proxy attaches auth.
 */
async function browserFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = init;
  const clean = path.replace(/^\/+/, "");
  const isForm = rest.body instanceof FormData;
  const res = await fetch(`/bff/${clean}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    const err = await parseError(res);
    throw new HttpError(err.status, err.message, err.fieldErrors, err.code);
  }
  if (res.status === 204) return undefined as T;
  // Some endpoints return 200 with an empty body (e.g. an absent entitlement).
  // res.json() throws on empty input, so parse defensively.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function serverFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  // DEMO_MODE: no backend exists — answer auth/billing/admin/guest server-action
  // calls from canned fixtures. Throws HttpError for the error cases (e.g. a bad
  // login → 401) exactly like the real backend, so the auth actions branch right.
  if (isDemoMode()) {
    const { demoServerFetch } = await import("./demo/server");
    return demoServerFetch<T>(path, init);
  }
  const { accessToken, headers, ...rest } = init;
  const url = `${config.internalApiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body && !(rest.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await parseError(res);
    throw new HttpError(err.status, err.message, err.fieldErrors, err.code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Auth API — only ever used from server actions (auth.ts). Goes directly to
 * the backend with the cookie-resident access token.
 */
export const authApi = {
  register: (
    body: {
      name: string;
      email: string;
      password: string;
      // Optional retailer trial-signup fields (provision shop org + trial subscription).
      shopName?: string;
      city?: string;
      state?: string;
      phone?: string;
      tier?: string;
      // "customer" creates a CUSTOMER-role account; otherwise a RETAILER signup.
      accountType?: string;
    },
    // The browser hits this via a server action, so the backend would otherwise
    // only ever see the frontend server's IP. Forward the real client IP so the
    // backend's per-IP signup rate limiter buckets by the actual visitor.
    clientIp?: string,
  ) =>
    serverFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  login: (body: { email: string; password: string }, clientIp?: string) =>
    serverFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      // Forward the real client IP so the backend's per-IP login limiter buckets
      // by the actual visitor, not the single frontend-server IP.
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  // Second step of an admin login: same credentials + the emailed 6-digit code.
  loginOtp: (body: { email: string; password: string; code: string }, clientIp?: string) =>
    serverFetch<AuthResponse>("/api/auth/login/otp", {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  refresh: (refreshToken: string) =>
    serverFetch<AuthResponse>("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  // Trade the one-time code from the Google callback for the real token pair.
  // 401 when the code is expired, already used, or fabricated.
  exchangeOAuthCode: (code: string) =>
    serverFetch<AuthResponse>("/api/auth/oauth2/exchange", { method: "POST", body: JSON.stringify({ code }) }),
  logout: (accessToken: string) =>
    serverFetch<{ message: string }>("/api/auth/logout", { method: "POST", accessToken }),
  deleteAccount: (accessToken: string) =>
    serverFetch<void>("/api/auth/account", { method: "DELETE", accessToken }),
  me: (accessToken: string) =>
    serverFetch<{ userId: string }>("/api/auth/me", { accessToken }),
  profile: (accessToken: string) =>
    serverFetch<UserProfile>("/api/auth/profile", { accessToken }),
};

/**
 * Billing API for SERVER components (e.g. gating subscriber-only pages). Goes
 * directly to the backend with the cookie-resident access token. The browser
 * equivalent is `api.getCurrentSubscription()` via the BFF.
 */
export const billingApi = {
  currentSubscription: (accessToken: string) =>
    serverFetch<import("./types").SubscriptionSummary>("/api/billing/subscriptions/current", {
      accessToken,
    }),
  subscriptionHistory: (accessToken: string) =>
    serverFetch<import("./types").SubscriptionSummary[]>("/api/billing/subscriptions", {
      accessToken,
    }),
  plans: (accessToken: string) =>
    serverFetch<import("./types").PlanOption[]>("/api/billing/plans", { accessToken }),
};

/**
 * Customer entitlement for SERVER components (e.g. the studio's access gate for
 * CUSTOMER accounts). Returns null when the customer has no entitlement yet.
 * The browser equivalent is `api.getMyEntitlement()` via the BFF.
 */
export const entitlementApi = {
  my: (accessToken: string) =>
    serverFetch<CustomerEntitlement | null>("/api/me/entitlement", { accessToken }),
};

/** A shop owner's request for a retailer account (public lead form on /trial). */
export interface ShopLeadPayload {
  name: string;
  email: string;
  phone?: string;
  shopName: string;
  city?: string;
  state?: string;
  tier?: string;
  notes?: string;
}

/**
 * Public shop-account lead submission — server action only (no auth). The
 * backend stores the lead for the admin queue and pings the admin inbox.
 */
export const leadApi = {
  submitShopLead: (body: ShopLeadPayload, clientIp?: string) =>
    serverFetch<{ id: string; status: string }>("/api/leads/shop", {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
};

/**
 * Admin API — ROLE_ADMIN only, used from admin server actions. Goes directly to
 * the backend with the admin's cookie-resident access token.
 */
export const adminApi = {
  createRetailer: (
    accessToken: string,
    body: {
      name: string;
      email: string;
      password: string;
      shopName: string;
      city?: string;
      state?: string;
      phone?: string;
      tier?: string;
    },
  ) =>
    serverFetch<{ id: string; name: string; email: string; role: string }>("/api/admin/retailers", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  // Companies for the shade-upload dropdown.
  listUploadBrands: (accessToken: string) =>
    serverFetch<UploadBrand[]>("/api/admin/paint/brands", { accessToken }),
  // Bulk-import a JSON array of shades for an existing or new company.
  uploadShades: (
    accessToken: string,
    body: { brandSlug?: string; brandName?: string; shades: unknown[]; enrich?: boolean },
  ) =>
    serverFetch<ShadeUploadResult>("/api/admin/paint/upload", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  // Wipe the entire shade catalog (all brands). The backend also clears the applied-colour
  // references projects' regions hold and evicts the shade caches.
  deleteAllShades: (accessToken: string) =>
    serverFetch<DeleteAllShadesResult>("/api/admin/paint/shades", {
      method: "DELETE",
      accessToken,
    }),
  // User lookup for the admin console (case-insensitive name/email substring).
  searchUsers: (accessToken: string, q: string) =>
    serverFetch<AdminUserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}&size=20`, {
      accessToken,
    }),
  // Audit trail — every sensitive action, newest first. Optional exact action filter.
  listAuditLog: (accessToken: string, action?: string) =>
    serverFetch<AuditLogRow[]>(
      `/api/admin/audit?size=50${action ? `&action=${encodeURIComponent(action)}` : ""}`,
      { accessToken },
    ),
  // Shop-account request queue (public /trial form feeds it).
  listShopLeads: (accessToken: string) =>
    serverFetch<ShopLeadRow[]>("/api/admin/leads", { accessToken }),
  updateShopLeadStatus: (accessToken: string, leadId: string, status: ShopLeadStatus) =>
    serverFetch<ShopLeadRow>(`/api/admin/leads/${encodeURIComponent(leadId)}/status`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({ status }),
    }),
  // Wallet payout queue: the manual "redeem to UPI" requests retailers file.
  listWalletRedemptions: (accessToken: string, status?: string) =>
    serverFetch<import("./types").WalletRedemption[]>(
      `/api/admin/wallet/redemptions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      { accessToken },
    ),
  decideWalletRedemption: (accessToken: string, redemptionId: string, approve: boolean, note?: string) =>
    serverFetch<import("./types").WalletRedemption>(
      `/api/admin/wallet/redemptions/${encodeURIComponent(redemptionId)}/decision`,
      { method: "POST", accessToken, body: JSON.stringify({ approve, note }) },
    ),
  // A user's active (or most recent) subscription. 404 (HttpError) when they have none.
  getUserSubscription: (accessToken: string, userId: string) =>
    serverFetch<import("./types").SubscriptionSummary>(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
      { accessToken },
    ),
  // Activate a plan for a user without a payment (supersedes any active plan).
  grantSubscription: (
    accessToken: string,
    userId: string,
    body: { plan: string; days: number; aiGenerationsLimit?: number },
  ) =>
    serverFetch<import("./types").SubscriptionSummary>(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
      { method: "POST", accessToken, body: JSON.stringify(body) },
    ),
  // Add AI image-generation credits and/or extend (reactivating a lapsed plan).
  adjustSubscription: (
    accessToken: string,
    userId: string,
    body: { addAiGenerations?: number; extendDays?: number },
  ) =>
    serverFetch<import("./types").SubscriptionSummary>(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
      { method: "PATCH", accessToken, body: JSON.stringify(body) },
    ),
};

/** A user as the admin console sees them (backend AdminUserResponse). */
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  provider: string;
  emailVerified: boolean;
  createdAt?: string | null;
}

/** One sensitive-action record from the backend audit trail. */
export interface AuditLogRow {
  id: number;
  actorUserId?: string | null;
  /** Resolved best-effort server-side; null for deleted users. */
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  createdAt?: string | null;
}

/** A shop-account request as the admin queue sees it. */
export type ShopLeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "DISMISSED";
export interface ShopLeadRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  shopName: string;
  city?: string | null;
  state?: string | null;
  tier?: string | null;
  notes?: string | null;
  status: ShopLeadStatus;
  createdAt?: string;
}

/** A company as shown in the shade-upload dropdown. */
export interface UploadBrand {
  id: number;
  name: string;
  slug: string;
}

/** Result of a bulk shade upload. */
export interface ShadeUploadResult {
  brand: string;
  slug: string;
  total: number;
  inserted: number;
  skipped: number;
}

/** Result of wiping the whole shade catalog. */
export interface DeleteAllShadesResult {
  deletedShades: number;
  clearedRegionReferences: number;
  message: string;
}

/**
 * Server-side guest helpers. `redeemGuest` is anonymous (no token); `claimGuest`
 * runs right after a user signs in to re-point their guest projects to the account.
 */
export const guestServerApi = {
  redeem: (code: string, clientIp?: string) =>
    serverFetch<import("./types").GuestRedeemResult>("/api/access-codes/redeem-guest", {
      method: "POST",
      body: JSON.stringify({ code }),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  claim: (accessToken: string, guestToken: string) =>
    serverFetch<{ linked: number }>("/api/projects/claim-guest", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ guestToken }),
    }),
};

/**
 * Public store-kiosk endpoints — server actions only, no auth (the slug is the
 * capability; the Razorpay signature is the proof of payment at verify time).
 */
export const storeServerApi = {
  info: (slug: string) =>
    serverFetch<import("./types").StorePublicInfo>(`/api/store/${encodeURIComponent(slug)}`),
  createOrder: (slug: string, clientIp?: string) =>
    serverFetch<import("./types").StoreOrder>(`/api/store/${encodeURIComponent(slug)}/order`, {
      method: "POST",
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  verify: (slug: string, body: { orderId: string; paymentId: string; signature: string }, clientIp?: string) =>
    serverFetch<import("./types").StoreCheckoutResult>(`/api/store/${encodeURIComponent(slug)}/verify`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
};

/**
 * Browser API — used from client components. Calls the same-origin BFF proxy
 * which handles auth, refresh and rate limiting.
 */
export const api = {
  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return browserFetch<UploadedImage>("api/images/upload", { method: "POST", body: form });
  },
  // --- Account profile + email/mobile verification (6-digit OTP) ---
  getMyProfile: () => browserFetch<UserProfile>("api/auth/profile"),
  sendEmailCode: () =>
    browserFetch<VerificationStatus>("api/auth/verify/email/send", { method: "POST" }),
  confirmEmailCode: (code: string) =>
    browserFetch<UserProfile>("api/auth/verify/email/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  sendPhoneCode: (phoneNumber?: string) =>
    browserFetch<VerificationStatus>("api/auth/verify/phone/send", {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    }),
  confirmPhoneCode: (code: string) =>
    browserFetch<UserProfile>("api/auth/verify/phone/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  listImages: () => browserFetch<UploadedImage[]>("api/images"),
  getImage: (id: string) =>
    browserFetch<UploadedImage>(`api/images/${encodeURIComponent(id)}`),
  listProjects: () => browserFetch<ProjectSummary[]>("api/projects"),
  createProject: (body: { imageId: string; name?: string; roomType?: string; notes?: string }) =>
    browserFetch<ProjectDetail>("api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // opts.maskMode ("AUTO" default / "MANUAL") is open to every caller — it decides
  // whether AI wall detection runs after the compulsory photo clean-up (MANUAL stops
  // there; walls are then marked by hand, free on every plan). opts.cleanImage is an
  // ADMIN-only testing knob (the backend strips it for other roles). Masks are always
  // stored raw — exactly as the model painted them.
  requestSegmentation: (projectId: string, opts?: SegmentationOptions) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/segment`, {
      method: "POST",
      ...(opts ? { body: JSON.stringify(opts) } : {}),
    }),
  getProjectStatus: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/status`),
  getProject: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}`),
  // Partial update — send only the fields being edited (e.g. a rename).
  updateProject: (projectId: string, body: { name?: string; roomType?: string; notes?: string }) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  // Claude palette suggestions for the project photo. Costs 1 AI preview from
  // the retailer's monthly quota — 402 when out of credits or unsubscribed.
  getAiRecommendations: (projectId: string) =>
    browserFetch<import("./types").AiRecommendationResponse>(
      `api/projects/${encodeURIComponent(projectId)}/recommendations`,
      { method: "POST" },
    ),
  // `brands` limits which paint companies the share viewer may repaint with
  // (omit / empty = every brand).
  generateShareLink: (projectId: string, days = 7, brands?: string[]) =>
    browserFetch<import("./types").ShareLink>(
      `api/projects/${encodeURIComponent(projectId)}/share?days=${days}` +
        (brands && brands.length > 0 ? `&brands=${encodeURIComponent(brands.join(","))}` : ""),
      { method: "POST" },
    ),
  // Autosave — fires on every swatch click; the backend answers 204 (returning
  // the full project would re-send every region's base64 mask each time).
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[]) =>
    browserFetch<void>(`api/projects/${encodeURIComponent(projectId)}/regions`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  // Persist a hand-drawn (polygon) mask as a new region. maskBase64 may be a bare
  // base64 string or a data URL; category is MAIN_WALL | ACCENT_WALL | TRIM | MANUAL.
  createCustomMask: (
    projectId: string,
    body: { maskBase64: string; category?: string; label?: string },
  ) =>
    browserFetch<RegionDetail>(`api/projects/${encodeURIComponent(projectId)}/regions/custom-mask`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Replace an EXISTING region's mask with a hand-refined one. Unlike delete this
  // works for AI-detected regions too — it's how a mask the AI got wrong (half a
  // pillar, an overshooting edge) is fixed after segmentation. maskBase64 may be a
  // bare base64 string or a data URL. Only the mask changes; colour/label/category stay.
  updateRegionMask: (projectId: string, regionId: number, maskBase64: string) =>
    browserFetch<RegionDetail>(
      `api/projects/${encodeURIComponent(projectId)}/regions/${regionId}/mask`,
      { method: "PUT", body: JSON.stringify({ maskBase64 }) },
    ),
  // Delete a hand-drawn wall. The backend rejects non-manual (AI-detected) regions.
  deleteRegion: (projectId: string, regionId: number) =>
    browserFetch<void>(
      `api/projects/${encodeURIComponent(projectId)}/regions/${regionId}`,
      { method: "DELETE" },
    ),
  // --- Subscription (retailer AI plan / trial) ---
  getCurrentSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/current"),
  // Every subscription the account has held, newest first (the /subscription page's history list).
  getSubscriptionHistory: () =>
    browserFetch<import("./types").SubscriptionSummary[]>("api/billing/subscriptions"),
  // Cancel at period end (paid) / end immediately (trial or admin-granted plan).
  cancelSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/cancel", {
      method: "POST",
    }),
  // All plan options with pricing + AI/PDF limits (drives the plan cards).
  listPlans: () => browserFetch<import("./types").PlanOption[]>("api/billing/plans"),
  // Colour-board PDF quota: read the allowance, and charge one download against it
  // (402 when the monthly limit is spent). Customers ride on the issuing shop's plan.
  getPdfAllowance: () =>
    browserFetch<import("./types").PdfAllowance>("api/billing/pdf-allowance"),
  chargePdfDownload: () =>
    browserFetch<import("./types").PdfAllowance>("api/billing/pdf-downloads", { method: "POST" }),
  // Start a paid subscription: backend creates a Razorpay subscription and returns
  // a hosted checkout `paymentUrl`. Requires an authenticated retailer (401 if not).
  createSubscription: (body: { plan: import("./types").PurchasablePlan; quantity?: number }) =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Verify the Razorpay Checkout success payload and activate the plan synchronously
  // (so the retailer is ACTIVE on return without waiting for the webhook).
  verifySubscription: (body: { subscriptionId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // --- Customer project entitlement (allowance + day-validity) ---
  getMyEntitlement: () => browserFetch<CustomerEntitlement | null>("api/me/entitlement"),
  // One-time purchase of an extra project (Razorpay): order -> Checkout -> verify.
  createProjectCreditOrder: () =>
    browserFetch<ProjectCreditOrder>("api/billing/project-credit/order", { method: "POST" }),
  verifyProjectCredit: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<CustomerEntitlement>("api/billing/project-credit/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // --- Pay-per-image overage (retailer buys one extra image after the monthly quota) ---
  // One-time purchase at Rs. 50 + 18% GST: order -> Checkout -> verify. Verify returns
  // the refreshed subscription with the credited image included in the remaining count.
  createImageCreditOrder: () =>
    browserFetch<ProjectCreditOrder>("api/billing/image-credits/order", { method: "POST" }),
  verifyImageCredit: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/image-credits/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // --- Prepaid billing wallet (top up once, spend on extra images / auto-masks) ---
  getBillingWallet: () =>
    browserFetch<import("./types").BillingWalletSummary>("api/billing/wallet"),
  createWalletTopUpOrder: (amountPaise: number) =>
    browserFetch<ProjectCreditOrder>("api/billing/wallet/topup/order", {
      method: "POST",
      body: JSON.stringify({ amountPaise }),
    }),
  verifyWalletTopUp: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").BillingWalletSummary>("api/billing/wallet/topup/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Atomic wallet debits: ₹59 buys one extra image, ₹29.50 one extra AI auto-mask.
  // Both 402 with a clear message when the balance is short.
  walletPayImageCredit: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/wallet/pay/image-credit", {
      method: "POST",
    }),
  walletPayAutoMaskCredit: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/wallet/pay/auto-mask-credit", {
      method: "POST",
    }),
  // Companies that actually have shades in the catalogue (name + slug + count).
  listShadeBrands: () =>
    browserFetch<import("./types").ShadeBrandSummary[]>("api/shades/brands"),
  // --- Paint product catalogue (shopkeeper-managed) ---
  listPaintBrands: () => browserFetch<PaintBrand[]>("api/paint/brands"),
  addPaintBrand: (body: { name: string }) =>
    browserFetch<PaintBrand>("api/paint/brands", { method: "POST", body: JSON.stringify(body) }),
  listPaintLines: (brandId: number, category: ProductCategory) =>
    browserFetch<PaintLine[]>(`api/paint/brands/${brandId}/lines?category=${category}`),
  addPaintLine: (
    brandId: number,
    body: { name: string; category: ProductCategory; qualityTier?: QualityTier; defaultFinish?: string },
  ) =>
    browserFetch<PaintLine>(`api/paint/brands/${brandId}/lines`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listShopProducts: (orgId: string) =>
    browserFetch<ShopProduct[]>(`api/organizations/${encodeURIComponent(orgId)}/products`),
  createShopProduct: (
    orgId: string,
    body: {
      lineId: number;
      price?: number;
      priceUnit?: string;
      packSize?: string;
      coverage?: string;
      finish?: string;
      qualityTier?: QualityTier;
      brightness?: number;
      imageUrl?: string;
      features?: string;
      description?: string;
    },
  ) =>
    browserFetch<ShopProduct>(`api/organizations/${encodeURIComponent(orgId)}/products`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteShopProduct: (orgId: string, productId: string) =>
    browserFetch<void>(`api/organizations/${encodeURIComponent(orgId)}/products/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    }),
  // --- Retailer: organizations + customer access codes ---
  listMyOrgs: () => browserFetch<OrgResponse[]>("api/organizations/mine"),
  createOrganization: (body: { name: string; slug: string; type: "RETAILER" | "DISTRIBUTOR" }) =>
    browserFetch<OrgResponse>("api/organizations", { method: "POST", body: JSON.stringify(body) }),
  listAccessCodes: (orgId: string) =>
    browserFetch<AccessCode[]>(`api/organizations/${encodeURIComponent(orgId)}/access-codes`),
  // The shop's view of what a guest picked with this code — FULL project with the
  // real shade codes (the guest sees the masked projection). Empty body (=> undefined)
  // when the guest hasn't created a project yet.
  getGuestProjectForCode: (codeId: string) =>
    browserFetch<ProjectDetail | undefined>(
      `api/access-codes/${encodeURIComponent(codeId)}/guest-project`,
    ),
  createAccessCode: (orgId: string, body: { validDays: number; allowedBrands?: string[] }) =>
    browserFetch<AccessCode>(`api/organizations/${encodeURIComponent(orgId)}/access-codes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // --- Retailer: suggested three-shade combinations ("shop picks") ---
  listCombos: (orgId: string) =>
    browserFetch<import("./types").RetailerCombo[]>(
      `api/organizations/${encodeURIComponent(orgId)}/combos`,
    ),
  createCombo: (
    orgId: string,
    body: { name: string; scope: import("./types").ComboScope; shades: import("./types").ComboShade[] },
  ) =>
    browserFetch<import("./types").RetailerCombo>(
      `api/organizations/${encodeURIComponent(orgId)}/combos`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  deleteCombo: (orgId: string, comboId: string) =>
    browserFetch<void>(
      `api/organizations/${encodeURIComponent(orgId)}/combos/${encodeURIComponent(comboId)}`,
      { method: "DELETE" },
    ),
  // The combos the studio should offer the CALLER (resolved server-side: own shop
  // for retailer staff, the entitling shop for customers, the code's shop for guests).
  getRetailerCombos: () =>
    browserFetch<import("./types").RetailerCombo[]>("api/me/retailer-combos"),
  // --- Retailer: shade-code scheme (customer-facing codes derive from ONE pattern) ---
  getShadeCodeScheme: (orgId: string) =>
    browserFetch<import("./shade-codes").ShadeCodeScheme>(
      `api/organizations/${encodeURIComponent(orgId)}/shade-code-scheme`,
    ),
  updateShadeCodeScheme: (orgId: string, body: import("./shade-codes").ShadeCodeScheme) =>
    browserFetch<import("./shade-codes").ShadeCodeScheme>(
      `api/organizations/${encodeURIComponent(orgId)}/shade-code-scheme`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  // The scheme the studio should encode codes with for the CALLER (resolved the
  // same way as retailer combos). All parts empty = no scheme.
  getMyShadeCodeScheme: () =>
    browserFetch<import("./shade-codes").ShadeCodeScheme>("api/me/shade-code-scheme"),
  // --- Retailer: public store kiosk links + earnings wallet ---
  listStoreLinks: (orgId: string) =>
    browserFetch<import("./types").StoreLink[]>(
      `api/organizations/${encodeURIComponent(orgId)}/store-links`,
    ),
  createStoreLink: (orgId: string, body: { pricePaise: number; validDays?: number }) =>
    browserFetch<import("./types").StoreLink>(
      `api/organizations/${encodeURIComponent(orgId)}/store-links`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateStoreLink: (linkId: string, body: { pricePaise?: number; validDays?: number; active?: boolean }) =>
    browserFetch<import("./types").StoreLink>(
      `api/store-links/${encodeURIComponent(linkId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  getWallet: (orgId: string) =>
    browserFetch<import("./types").WalletSummary>(
      `api/organizations/${encodeURIComponent(orgId)}/wallet`,
    ),
  requestWalletRedemption: (orgId: string, body: { amountPaise: number; upiId: string }) =>
    browserFetch<import("./types").WalletRedemption>(
      `api/organizations/${encodeURIComponent(orgId)}/wallet/redemptions`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  // --- Customer: redeem a retailer's code (flips this account to CUSTOMER) ---
  redeemAccessCode: (body: { code: string }) =>
    browserFetch<AccessCode>("api/access-codes/redeem", { method: "POST", body: JSON.stringify(body) }),
  // --- Support: AI conversations with human handoff ---
  startSupport: (body: { message: string; subject?: string }) =>
    browserFetch<SupportConversation>("api/support/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSupport: () => browserFetch<SupportConversationSummary[]>("api/support/conversations"),
  getSupport: (id: string) =>
    browserFetch<SupportConversation>(`api/support/conversations/${encodeURIComponent(id)}`),
  postSupport: (id: string, body: { body: string }) =>
    browserFetch<SupportConversation>(`api/support/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requestHumanSupport: (id: string) =>
    browserFetch<SupportConversation>(`api/support/conversations/${encodeURIComponent(id)}/request-human`, {
      method: "POST",
    }),
  // --- Support staff inbox (ADMIN) ---
  listSupportInbox: () => browserFetch<SupportConversationSummary[]>("api/support/inbox"),
  getSupportInbox: (id: string) =>
    browserFetch<SupportConversation>(`api/support/inbox/${encodeURIComponent(id)}`),
  replySupport: (id: string, body: { body: string }) =>
    browserFetch<SupportConversation>(`api/support/inbox/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resolveSupport: (id: string) =>
    browserFetch<SupportConversation>(`api/support/inbox/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
    }),
  listCustomers: (orgId: string) =>
    browserFetch<CustomerEntitlement[]>(`api/organizations/${encodeURIComponent(orgId)}/customers`),
  grantProject: (orgId: string, customerId: string) =>
    browserFetch<CustomerEntitlement>(
      `api/organizations/${encodeURIComponent(orgId)}/customers/${encodeURIComponent(customerId)}/grant-project`,
      { method: "POST" },
    ),
};

/**
 * Guest (anonymous, access-code-scoped) creator API. Same shapes as the relevant
 * `api` methods but hitting /api/guest/* (the BFF attaches the guest token). The
 * guest gets ONE project and sees masked responses — real shade codes are hidden
 * from them. AI wall-detection is available but billed to the issuing shop's quota;
 * a 402 means the shop is out of credits and the guest marks walls by hand instead.
 */
export const guestApi = {
  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return browserFetch<UploadedImage>("api/guest/images/upload", { method: "POST", body: form });
  },
  createProject: (body: { imageId: string; name?: string; roomType?: string; notes?: string }) =>
    browserFetch<ProjectDetail>("api/guest/projects", { method: "POST", body: JSON.stringify(body) }),
  getProject: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/guest/projects/${encodeURIComponent(projectId)}`),
  listProjects: () => browserFetch<ProjectSummary[]>("api/guest/projects"),
  // AI wall-detection (billed to the issuing shop). Throws HttpError 402 when the
  // shop has no AI credits left — caller should fall back to manual wall-marking.
  requestSegmentation: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/guest/projects/${encodeURIComponent(projectId)}/segment`, {
      method: "POST",
    }),
  // Autosave — 204, same featherweight contract as the signed-in path.
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[]) =>
    browserFetch<void>(`api/guest/projects/${encodeURIComponent(projectId)}/regions`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  createCustomMask: (
    projectId: string,
    body: { maskBase64: string; category?: string; label?: string },
  ) =>
    browserFetch<RegionDetail>(`api/guest/projects/${encodeURIComponent(projectId)}/regions/custom-mask`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRegionMask: (projectId: string, regionId: number, maskBase64: string) =>
    browserFetch<RegionDetail>(
      `api/guest/projects/${encodeURIComponent(projectId)}/regions/${regionId}/mask`,
      { method: "PUT", body: JSON.stringify({ maskBase64 }) },
    ),
  deleteRegion: (projectId: string, regionId: number) =>
    browserFetch<void>(
      `api/guest/projects/${encodeURIComponent(projectId)}/regions/${regionId}`,
      { method: "DELETE" },
    ),
  // "I'm done — this is the one": idempotent; the shop owner gets an email
  // heads-up and the portal shows a "sent by customer" badge.
  sendToShop: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/guest/projects/${encodeURIComponent(projectId)}/send-to-shop`, {
      method: "POST",
    }),
  // Colour-board PDF quota — billed to the issuing shop's plan.
  getPdfAllowance: () =>
    browserFetch<import("./types").PdfAllowance>("api/guest/pdf-allowance"),
  chargePdfDownload: () =>
    browserFetch<import("./types").PdfAllowance>("api/guest/pdf-downloads", { method: "POST" }),
};

export { HttpError };
