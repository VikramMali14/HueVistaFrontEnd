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
  refresh: (refreshToken: string) =>
    serverFetch<AuthResponse>("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
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
  // Shop-account request queue (public /trial form feeds it).
  listShopLeads: (accessToken: string) =>
    serverFetch<ShopLeadRow[]>("/api/admin/leads", { accessToken }),
  updateShopLeadStatus: (accessToken: string, leadId: string, status: ShopLeadStatus) =>
    serverFetch<ShopLeadRow>(`/api/admin/leads/${encodeURIComponent(leadId)}/status`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({ status }),
    }),
};

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
  requestSegmentation: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/segment`, {
      method: "POST",
    }),
  getProjectStatus: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/status`),
  getProject: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}`),
  generateShareLink: (projectId: string, days = 7) =>
    browserFetch<import("./types").ShareLink>(
      `api/projects/${encodeURIComponent(projectId)}/share?days=${days}`,
      { method: "POST" },
    ),
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[]) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/regions`, {
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
  // Delete a hand-drawn wall. The backend rejects non-manual (AI-detected) regions.
  deleteRegion: (projectId: string, regionId: number) =>
    browserFetch<void>(
      `api/projects/${encodeURIComponent(projectId)}/regions/${regionId}`,
      { method: "DELETE" },
    ),
  // --- Subscription (retailer AI plan / trial) ---
  getCurrentSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/current"),
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
  createAccessCode: (orgId: string, body: { validDays: number; allowedBrands?: string[] }) =>
    browserFetch<AccessCode>(`api/organizations/${encodeURIComponent(orgId)}/access-codes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[]) =>
    browserFetch<ProjectDetail>(`api/guest/projects/${encodeURIComponent(projectId)}/regions`, {
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
  deleteRegion: (projectId: string, regionId: number) =>
    browserFetch<void>(
      `api/guest/projects/${encodeURIComponent(projectId)}/regions/${regionId}`,
      { method: "DELETE" },
    ),
};

export { HttpError };
