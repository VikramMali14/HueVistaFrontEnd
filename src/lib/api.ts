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

class HttpError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

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
  return { status: res.status, message, fieldErrors };
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
    throw new HttpError(err.status, err.message, err.fieldErrors);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function serverFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
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
    throw new HttpError(err.status, err.message, err.fieldErrors);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  login: (body: { email: string; password: string }) =>
    serverFetch<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  refresh: (refreshToken: string) =>
    serverFetch<AuthResponse>("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  logout: (accessToken: string) =>
    serverFetch<{ message: string }>("/api/auth/logout", { method: "POST", accessToken }),
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
  // --- Subscription (retailer AI plan / trial) ---
  getCurrentSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/current"),
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
  createAccessCode: (orgId: string, body: { validDays: number }) =>
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

export { HttpError };
