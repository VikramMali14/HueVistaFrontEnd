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
import type { SiteAsset } from "./site-assets";
import type {
  AccessCode,
  ApiError,
  AuthResponse,
  CustomerEntitlement,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProductCategory,
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
 * Organizations API for SERVER components. The portal page fetches the user's
 * orgs ONCE here and passes them to its sections, instead of every section
 * fetching the same list through the BFF on mount.
 */
export const orgApi = {
  mine: (accessToken: string) =>
    serverFetch<OrgResponse[]>("/api/organizations/mine", { accessToken }),
  // The shop's saved shade-code scheme, for SERVER components (e.g. deciding
  // whether to show the dashboard code checker). Browser equivalent:
  // `api.getShadeCodeScheme(orgId)` via the BFF.
  shadeCodeScheme: (accessToken: string, orgId: string) =>
    serverFetch<import("./shade-codes").ShadeCodeScheme>(
      `/api/organizations/${encodeURIComponent(orgId)}/shade-code-scheme`,
      { accessToken },
    ),
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

/**
 * A shop owner's request for a retailer account (public form on /trial).
 *
 * Carries the password they will sign in with, typed twice. No plan is asked
 * for — every shop is created free and buys a plan later if it wants one.
 */
export interface ShopLeadPayload {
  name: string;
  email: string;
  phone?: string;
  shopName: string;
  city?: string;
  state?: string;
  password: string;
  confirmPassword: string;
  notes?: string;
}

/** What the request funnel reports back after each step. */
export interface ShopRequestStatus {
  requestId: string;
  /** Masked, e.g. `p***@mehtapaints.in`. */
  email: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
  status: "PENDING_EMAIL" | "AWAITING_APPROVAL" | string;
}

/**
 * Public shop-account request funnel — server actions only (no auth).
 *
 * Three steps: submit stores the request and emails a code, verify confirms the
 * mailbox and queues it, resend sends another code. No account exists until an
 * admin approves the queued request (or the 24-hour deadline does).
 */
export const leadApi = {
  submitShopLead: (body: ShopLeadPayload, clientIp?: string) =>
    serverFetch<ShopRequestStatus>("/api/leads/shop", {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  verifyShopRequest: (requestId: string, code: string, clientIp?: string) =>
    serverFetch<ShopRequestStatus>(
      `/api/leads/shop/${encodeURIComponent(requestId)}/verify`,
      {
        method: "POST",
        body: JSON.stringify({ code }),
        headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
      },
    ),
  resendShopRequestCode: (requestId: string, clientIp?: string) =>
    serverFetch<ShopRequestStatus>(
      `/api/leads/shop/${encodeURIComponent(requestId)}/resend`,
      {
        method: "POST",
        headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
      },
    ),
};

/**
 * The monthly letter. Public on both ends: signing up needs no account, and neither
 * does leaving — the unsubscribe token in the welcome mail is the whole authorisation,
 * because "cancel quietly, any time" cannot mean "first, log in".
 */
export const newsletterApi = {
  subscribe: (email: string, source: string, clientIp?: string) =>
    serverFetch<{ status: string; message: string }>("/api/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email, source }),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
  unsubscribe: (token: string, clientIp?: string) =>
    serverFetch<{ status: string; message: string }>(
      `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
      },
    ),
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
      // Which distributor the shop belongs under. Omitted = the house distributor,
      // so a shop is never created outside the network.
      distributorOrgId?: string;
    },
  ) =>
    serverFetch<{ id: string; name: string; email: string; role: string }>("/api/admin/retailers", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  // Provision a DISTRIBUTOR account + org. Distributors then create their own shops.
  createDistributor: (
    accessToken: string,
    body: {
      name: string;
      email: string;
      password: string;
      companyName: string;
      city?: string;
      state?: string;
      phone?: string;
    },
  ) =>
    serverFetch<{ id: string; name: string; email: string; role: string }>("/api/admin/distributors", {
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
  // What a platform reset would clear and what it would keep, with live row counts.
  // Read-only — used to put real numbers on the confirmation screen.
  previewDataReset: (accessToken: string) =>
    serverFetch<DataResetResult>("/api/admin/data-reset", { accessToken }),
  // Wipe every account, shop, project and payment. Keeps the paint catalogue and the
  // calling admin's own account. Requires the exact confirmation phrase. `deleteImageFiles`
  // additionally empties the image store, which no snapshot can undo.
  resetPlatformData: (accessToken: string, confirmation: string, deleteImageFiles: boolean) =>
    serverFetch<DataResetResult>("/api/admin/data-reset", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ confirmation, deleteImageFiles }),
    }),
  // User lookup for the admin console (case-insensitive name/email substring).
  searchUsers: (accessToken: string, q: string) =>
    serverFetch<AdminUserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}&size=20`, {
      accessToken,
    }),
  // Audit trail — every sensitive action, newest first. Optional exact action
  // filter, zero-based page and page size (the backend caps size at 500).
  listAuditLog: (accessToken: string, action?: string, page = 0, size = 50) =>
    serverFetch<AuditLogRow[]>(
      `/api/admin/audit?page=${Math.max(0, page)}&size=${size}${action ? `&action=${encodeURIComponent(action)}` : ""}`,
      { accessToken },
    ),
  // Payment audit — every checkout opened, whether or not it was paid. Filters are all
  // optional; an unrecognised value is ignored by the backend rather than erroring, so a
  // hand-typed URL still returns a report.
  listPaymentAttempts: (accessToken: string, filters: PaymentAuditFilters = {}, page = 0, size = 50) =>
    serverFetch<PaymentAttemptRow[]>(
      `/api/admin/payment-audit?${paymentAuditQuery(filters)}&page=${Math.max(0, page)}&size=${size}`,
      { accessToken },
    ),
  // Headline counts for the window: conversion, money lost, worst pages, decline reasons.
  paymentAuditSummary: (accessToken: string, days = 30) =>
    serverFetch<PaymentAuditSummary>(`/api/admin/payment-audit/summary?days=${days}`, { accessToken }),
  // Every checkout one account opened — the single-support-ticket view.
  listUserPaymentAttempts: (accessToken: string, userId: string) =>
    serverFetch<PaymentAttemptRow[]>(
      `/api/admin/payment-audit/users/${encodeURIComponent(userId)}`,
      { accessToken },
    ),
  // Shop-account request queue (public /trial form feeds it).
  listShopLeads: (accessToken: string) =>
    serverFetch<ShopLeadRow[]>("/api/admin/leads", { accessToken }),
  // One click: turn a verified request into a shop account under `distributorOrgId`
  // (omitted = the house distributor).
  approveShopLead: (accessToken: string, leadId: string, distributorOrgId?: string) =>
    serverFetch<ShopLeadRow>(`/api/admin/leads/${encodeURIComponent(leadId)}/approve`, {
      method: "POST",
      accessToken,
      body: JSON.stringify(distributorOrgId ? { distributorOrgId } : {}),
    }),
  dismissShopLead: (accessToken: string, leadId: string) =>
    serverFetch<ShopLeadRow>(`/api/admin/leads/${encodeURIComponent(leadId)}/dismiss`, {
      method: "POST",
      accessToken,
    }),
  // Distributors a shop can be filed under, house org first.
  listDistributors: (accessToken: string) =>
    serverFetch<DistributorOption[]>("/api/admin/distributors", { accessToken }),
  // --- Marketing-site images (see lib/site-assets.ts for the slot registry) ---
  listSiteAssets: (accessToken: string) =>
    serverFetch<SiteAsset[]>("/api/admin/site-assets", { accessToken }),
  /** Put an image in a slot, replacing whatever was there. Multipart: serverFetch
   *  leaves the Content-Type unset for FormData so the boundary is generated. */
  putSiteAsset: (accessToken: string, slot: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return serverFetch<SiteAsset>(`/api/admin/site-assets/${encodeURIComponent(slot)}`, {
      method: "POST",
      accessToken,
      body: form,
    });
  },
  /** Empty a slot — the page goes back to its built-in default. */
  clearSiteAsset: (accessToken: string, slot: string) =>
    serverFetch<void>(`/api/admin/site-assets/${encodeURIComponent(slot)}`, {
      method: "DELETE",
      accessToken,
    }),
  // Re-file a shop under another distributor (omit = the house one). The previous
  // distributor's brand/page grants are cleared server-side — they were theirs to make.
  moveRetailer: (accessToken: string, retailerOrgId: string, distributorOrgId?: string) =>
    serverFetch<OrgResponse>(
      `/api/admin/retailers/${encodeURIComponent(retailerOrgId)}/distributor`,
      {
        method: "PUT",
        accessToken,
        body: JSON.stringify(distributorOrgId ? { distributorOrgId } : {}),
      },
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
    body: { plan: string; days: number; projectsLimit?: number },
  ) =>
    serverFetch<import("./types").SubscriptionSummary>(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
      { method: "POST", accessToken, body: JSON.stringify(body) },
    ),
  // Grant extra project credits (they survive renewal) and/or extend the period,
  // reactivating a lapsed plan.
  adjustSubscription: (
    accessToken: string,
    userId: string,
    body: { addProjects?: number; extendDays?: number },
  ) =>
    serverFetch<import("./types").SubscriptionSummary>(
      `/api/admin/users/${encodeURIComponent(userId)}/subscription`,
      { method: "PATCH", accessToken, body: JSON.stringify(body) },
    ),

  // ─── Free-project library ──────────────────────────────────────────────────
  // Ready-made rooms: published once from a real segmented project, then opened
  // by anyone. Starting one creates a project from stored rows and files — no
  // upload, no wall detection, nothing charged.
  listFreeProjects: (accessToken: string, includeUnpublished = true) =>
    serverFetch<FreeProjectTemplate[]>(
      `/api/admin/free-projects?includeUnpublished=${includeUnpublished}`,
      { accessToken },
    ),
  // The admin's own projects, each marked with whether it has walls to copy.
  listFreeProjectSources: (accessToken: string) =>
    serverFetch<PublishableProject[]>("/api/admin/free-projects/sources", { accessToken }),
  publishFreeProject: (accessToken: string, body: PublishFreeProjectBody) =>
    serverFetch<FreeProjectTemplate>("/api/admin/free-projects", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  startFreeProject: (accessToken: string, templateId: string) =>
    serverFetch<StartedFreeProject>(
      `/api/admin/free-projects/${encodeURIComponent(templateId)}/start`,
      { method: "POST", accessToken },
    ),
  // Re-copy the photo and every mask from the project the template was published
  // from. The template keeps its id, slug, shelf position, published state and
  // usage count — this is how a mask gets fixed after publishing, since publishing
  // freezes a copy of them.
  refreshFreeProject: (accessToken: string, templateId: string) =>
    serverFetch<FreeProjectTemplate>(
      `/api/admin/free-projects/${encodeURIComponent(templateId)}/refresh`,
      { method: "POST", accessToken },
    ),
  setFreeProjectPublished: (accessToken: string, templateId: string, published: boolean) =>
    serverFetch<FreeProjectTemplate>(
      `/api/admin/free-projects/${encodeURIComponent(templateId)}/published?published=${published}`,
      { method: "PATCH", accessToken },
    ),
  // purgeFiles deletes the shared photo and masks, which blanks out every copy
  // anyone already started — left false unless explicitly asked for.
  deleteFreeProject: (accessToken: string, templateId: string, purgeFiles = false) =>
    serverFetch<TemplateRemoved>(
      `/api/admin/free-projects/${encodeURIComponent(templateId)}?purgeFiles=${purgeFiles}`,
      { method: "DELETE", accessToken },
    ),
  // The same over a selection. Each is removed independently, so one that has
  // already gone is reported rather than abandoning the rest.
  deleteFreeProjects: (accessToken: string, templateIds: string[], purgeFiles = false) =>
    serverFetch<TemplateDeletionResult>("/api/admin/free-projects/delete", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ templateIds, purgeFiles }),
    }),
};

/** Interiors are shelved by room; exteriors by style. */
export type TemplateSpace = "INTERIOR" | "EXTERIOR";

/** One wall of a template — a mask PNG made once, at publish time. */
export interface FreeProjectTemplateRegion {
  id: number;
  label?: string | null;
  category?: string | null;
  maskUrl: string;
  appliedHexCode?: string | null;
  appliedShadeCode?: string | null;
  displayOrder: number;
}

/** A ready-made room on the shelf. */
export interface FreeProjectTemplate {
  id: string;
  slug: string;
  title: string;
  space: TemplateSpace;
  /** "LIVING_ROOM", "KITCHEN", "TRADITIONAL"… */
  roomKey: string;
  roomLabel: string;
  description?: string | null;
  imageUrl: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  published: boolean;
  displayOrder: number;
  /** Only ever counts up — includes copies people have since deleted. */
  timesUsed: number;
  regionCount: number;
  /**
   * Copies alive right now still pointing at this template's stored files — so,
   * exactly how many rooms would go blank if those files were deleted.
   */
  copiesInUse: number;
  regions: FreeProjectTemplateRegion[];
  sourceProjectId?: string | null;
  createdAt?: string | null;
}

/** One template removed, and what it cost. */
export interface TemplateRemoved {
  id: string;
  title: string;
  filesPurged: number;
  copiesBroken: number;
}

/** The outcome of removing a selection. */
export interface TemplateDeletionResult {
  removed: TemplateRemoved[];
  failed: { id: string; reason: string }[];
  filesPurged: number;
  copiesBroken: number;
}

/** One of the admin's projects, offered as the source for a new template. */
export interface PublishableProject {
  id: string;
  name: string;
  roomType?: string | null;
  status: string;
  imageUrl: string;
  regionCount: number;
  /** False when it has no masks yet — the picker greys it out and says why. */
  eligible: boolean;
  ineligibleReason?: string | null;
  updatedAt?: string | null;
}

export interface PublishFreeProjectBody {
  projectId: string;
  title: string;
  space: TemplateSpace;
  roomKey: string;
  roomLabel?: string;
  slug?: string;
  description?: string;
  displayOrder?: number;
  published?: boolean;
}

/** What "start a copy" hands back — enough to jump straight to the studio. */
export interface StartedFreeProject {
  projectId: string;
  name: string;
  status: string;
  regionCount: number;
  templateId: string;
  templateTitle: string;
}

/**
 * Hierarchy / network API — the admin → distributor → retailer → painter chain.
 * Server actions only; the backend scopes every call to the caller's role.
 */
export const networkApi = {
  // Role-scoped downline report (tree + totals).
  report: (accessToken: string) =>
    serverFetch<import("./types").NetworkReport>("/api/hierarchy/network", { accessToken }),
  // DISTRIBUTOR (or ADMIN): create a shop; a distributor's shop is auto-linked to them.
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
      // Access granted as part of setting the shop up. Both default to
      // unrestricted on the backend, so omitting them creates a shop with the
      // run of the whole product — the behaviour before this existed.
      brandIds?: number[];
      brandsUnrestricted?: boolean;
      features?: string[];
      featuresUnrestricted?: boolean;
    },
  ) =>
    serverFetch<{ id: string; name: string; email: string; role: string }>("/api/hierarchy/retailers", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  // RETAILER: create a painter already linked (ACTIVE) to the caller's shop.
  createPainter: (
    accessToken: string,
    body: { name: string; email: string; password: string; phone?: string },
  ) =>
    serverFetch<{ id: string; name: string; email: string; role: string }>("/api/hierarchy/painters", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),
  // DISTRIBUTOR (or ADMIN): every brand with a flag for whether this shop has it.
  retailerBrands: (accessToken: string, retailerOrgId: string) =>
    serverFetch<import("./types").RetailerBrandOption[]>(
      `/api/hierarchy/retailers/${encodeURIComponent(retailerOrgId)}/brands`,
      { accessToken },
    ),
  // DISTRIBUTOR (or ADMIN): replace a shop's brand selection wholesale.
  //
  // `unrestricted` is NOT optional in practice: the backend treats an empty
  // brandIds as a real revoke-everything, so omitting the flag (as this used to)
  // made "give them the whole catalogue" unreachable from the UI and silently
  // turned it into "give them nothing".
  setRetailerBrands: (
    accessToken: string,
    retailerOrgId: string,
    brandIds: number[],
    unrestricted: boolean,
  ) =>
    serverFetch<import("./types").RetailerBrandOption[]>(
      `/api/hierarchy/retailers/${encodeURIComponent(retailerOrgId)}/brands`,
      { method: "PUT", accessToken, body: JSON.stringify({ brandIds, unrestricted }) },
    ),
  // DISTRIBUTOR (or ADMIN): every grantable page with a flag for whether this shop has it.
  retailerFeatures: (accessToken: string, retailerOrgId: string) =>
    serverFetch<import("./types").RetailerFeatureOption[]>(
      `/api/hierarchy/retailers/${encodeURIComponent(retailerOrgId)}/features`,
      { accessToken },
    ),
  // DISTRIBUTOR (or ADMIN): replace a shop's page selection wholesale. Same
  // three-state contract as setRetailerBrands above.
  setRetailerFeatures: (
    accessToken: string,
    retailerOrgId: string,
    features: string[],
    unrestricted: boolean,
  ) =>
    serverFetch<import("./types").RetailerFeatureOption[]>(
      `/api/hierarchy/retailers/${encodeURIComponent(retailerOrgId)}/features`,
      { method: "PUT", accessToken, body: JSON.stringify({ features, unrestricted }) },
    ),
  // The caller's own brand + page allowances — what the nav and page guards read.
  myAccess: (accessToken: string) =>
    serverFetch<import("./types").MyAccess>("/api/hierarchy/my-access", { accessToken }),
  // Everything a distributor could grant, with nothing assigned — the shop-creation
  // form's checklists, which have no shop to read a selection off yet.
  grantable: (accessToken: string) =>
    serverFetch<{
      brands: import("./types").RetailerBrandOption[];
      features: import("./types").RetailerFeatureOption[];
    }>("/api/hierarchy/grantable", { accessToken }),
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

/** Which checkout an attempt belongs to. */
export type PaymentFlowName = "SUBSCRIPTION" | "POINTS" | "PROJECT" | "REOPEN" | "STORE_KIOSK";

/** Where a checkout attempt stopped. */
export type PaymentAttemptStatusName =
  | "CREATED"
  | "OPENED"
  | "ABANDONED"
  | "FAILED"
  | "VERIFY_FAILED"
  | "PAID";

/**
 * One trip through a Razorpay Checkout, paid or not.
 *
 * Everything the backend recorded is here — this is an admin-only forensic view, and a
 * field trimmed out of the type is a field missing on the day somebody needs it.
 */
export interface PaymentAttemptRow {
  id: string;
  /** Razorpay order_… or sub_… — what the buyer's bank statement can be matched against. */
  reference: string;
  flow: PaymentFlowName;
  flowLabel: string;
  status: PaymentAttemptStatusName;
  statusLabel: string;
  /** The buyer was charged and got nothing. Always worth surfacing loudly. */
  moneyAtRisk: boolean;
  userId?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
  amountPaise: number;
  currency?: string | null;
  description?: string | null;
  plan?: string | null;
  paymentId?: string | null;
  /** The page the buyer clicked Pay on. */
  pageUrl?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorSource?: string | null;
  errorStep?: string | null;
  errorReason?: string | null;
  /** Our own account of a failure, as opposed to the gateway's. */
  failureNote?: string | null;
  /** Every transition, one per line, oldest first. */
  timeline?: string | null;
  createdAt?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  durationSeconds?: number | null;
}

export interface PaymentAuditFilters {
  status?: string;
  flow?: string;
  userId?: string;
  /** yyyy-MM-dd, inclusive. */
  from?: string;
  /** yyyy-MM-dd, inclusive. */
  to?: string;
  /** Free text over buyer e-mail, reference, payment id and page URL. */
  q?: string;
}

function paymentAuditQuery(f: PaymentAuditFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v && String(v).trim()) p.set(k, String(v).trim());
  }
  return p.toString();
}

export interface PaymentAuditSummary {
  windowDays: number | null;
  totalAttempts: number;
  paidCount: number;
  abandonedCount: number;
  failedCount: number;
  verifyFailedCount: number;
  /** Share of FINISHED attempts that were paid; null when nothing has finished yet. */
  conversionPercent: number | null;
  lostAmountPaise: number;
  /** Charged but undelivered. Should be zero — anything else is an incident. */
  moneyAtRiskPaise: number;
  byStatus: Record<string, { count: number; amountPaise: number }>;
  byFlow: { flow: PaymentFlowName; displayName: string; count: number; amountPaise: number }[];
  worstPages: { pageUrl: string; count: number; amountPaise: number }[];
  failureReasons: { errorCode: string; errorDescription: string; count: number }[];
}

/**
 * A shop-account request as the admin queue sees it. Carries everything the
 * owner filled in — the queue exists so an admin reads it and presses one
 * button, rather than retyping it into the creation form.
 *
 * NEW / CONTACTED / CONVERTED are the statuses of the old call-back funnel and
 * only appear on rows written before the current flow existed.
 */
export type ShopLeadStatus =
  | "PENDING_EMAIL"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "DISMISSED"
  | "NEW"
  | "CONTACTED"
  | "CONVERTED";
export interface ShopLeadRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  shopName: string;
  city?: string | null;
  state?: string | null;
  /** Legacy — the old funnel asked which plan they wanted; this one does not. */
  tier?: string | null;
  notes?: string | null;
  status: ShopLeadStatus;
  createdAt?: string;
  emailVerified: boolean;
  /** True when "Create account" is the only thing left to do. */
  readyToCreate: boolean;
  /** When the request provisions itself if nobody acts. */
  autoApproveAt?: string | null;
  hoursUntilAutoCreate?: number | null;
  distributorOrgId?: string | null;
  distributorName?: string | null;
  createdUserId?: string | null;
  approvedAt?: string | null;
  /** True when the 24-hour deadline created the account, not a person. */
  autoApproved: boolean;
}

/** A distributor an admin can file a shop under. */
export interface DistributorOption {
  orgId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  shopCount: number;
  /** The platform's own distributor — the default, listed first. */
  house: boolean;
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

/**
 * A platform data reset — either previewed or actually carried out. `deletedRows` and
 * `preservedTables` only list tables that hold rows, so an untouched platform reports
 * an empty object rather than three dozen zeroes.
 */
export interface DataResetResult {
  clearedTables: string[];
  preservedTables: Record<string, number>;
  deletedRows: Record<string, number>;
  totalDeleted: number;
  /** Image files removed from the store. Always 0 on a preview. */
  deletedImageFiles: number;
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
  // No-login redemption: auto-creates a passwordless CUSTOMER account and returns a
  // full session the caller persists as cookies.
  redeemAccount: (code: string, clientIp?: string) =>
    serverFetch<import("./types").RedeemAccountResult>("/api/access-codes/redeem-account", {
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
  // Kiosk checkout telemetry. Goes through a server action rather than the BFF because
  // the kiosk has no session at all — and that route is what carries the walk-in's real
  // IP through, so an abandoned kiosk sale is attributable to the counter it happened at.
  reportAttempt: (reference: string, body: CheckoutEventBody, clientIp?: string) =>
    serverFetch<void>(`/api/billing/attempts/${encodeURIComponent(reference)}/events`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: clientIp ? { "X-Forwarded-For": clientIp } : undefined,
    }),
};

/** What the browser can tell the backend about a Razorpay Checkout it was showing. */
export interface CheckoutEventBody {
  status: "OPENED" | "ABANDONED" | "FAILED" | "VERIFY_FAILED";
  pageUrl?: string;
  referrer?: string;
  paymentId?: string;
  errorCode?: string;
  errorDescription?: string;
  errorSource?: string;
  errorStep?: string;
  errorReason?: string;
}

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
  // --- Account profile + email verification (6-digit OTP) ---
  getMyProfile: () => browserFetch<UserProfile>("api/auth/profile"),
  /** Update the signed-in user's display name (the backend PATCH also accepts
   *  a picture URL; phone changes are NOT supported by this endpoint). */
  updateMyProfile: (body: { name: string }) =>
    browserFetch<UserProfile>("api/auth/profile", { method: "PATCH", body: JSON.stringify(body) }),
  /** Change the password of a LOCAL account. The backend revokes every session
   *  on success — the caller must sign the user out and back in. */
  changeMyPassword: (body: { currentPassword: string; newPassword: string }) =>
    browserFetch<{ message: string }>("api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sendEmailCode: () =>
    browserFetch<VerificationStatus>("api/auth/verify/email/send", { method: "POST" }),
  confirmEmailCode: (code: string) =>
    browserFetch<UserProfile>("api/auth/verify/email/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  // No sendPhoneCode/confirmPhoneCode: mobile verification is off until an SMS
  // sender is registered. The backend still serves /auth/verify/phone/*, so
  // these two come back from git history the day it can actually deliver.
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
  // (omit / empty = every brand). A share link hands its holder the ability to
  // repaint, exactly like a walk-in access code — so it gets the same 10-day
  // ceiling, and 10 days is the default.
  // Take a copy of someone else's shared room into your own account. Costs one
  // project (402 when there is none left); no AI runs, the walls come with it.
  claimSharedProject: (token: string) =>
    browserFetch<import("./types").ProjectDetail>(
      `api/share/${encodeURIComponent(token)}/claim`,
      { method: "POST" },
    ),
  generateShareLink: (projectId: string, days = 10, brands?: string[]) =>
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
  // Charge for a colour board AND record what was on it. The board is built in the
  // browser, so this is the only moment the shades that went onto paper can be captured
  // — and the response says whether that board was the one that closed the project.
  recordColourBoard: (projectId: string, pages: import("./types").ColourBoardPage[]) =>
    browserFetch<import("./types").ColourBoardResult>(
      `api/projects/${encodeURIComponent(projectId)}/colour-boards`,
      { method: "POST", body: JSON.stringify({ pages }) },
    ),
  // Finish the job early, before both boards are spent. Idempotent.
  closeProject: (projectId: string) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/close`, {
      method: "POST",
    }),
  // The combinations this project handed over — what a closed one still shows, and the
  // set an AI render may be made from.
  getProjectCombos: (projectId: string) =>
    browserFetch<import("./types").ProjectCombo[]>(
      `api/projects/${encodeURIComponent(projectId)}/combos`,
    ),
  // --- AI renders. Accepted immediately as QUEUED; poll until READY or FAILED.
  requestRender: (projectId: string, body: { comboId: string } & import("./types").RenderOptions) =>
    browserFetch<import("./types").ProjectRender>(
      `api/projects/${encodeURIComponent(projectId)}/renders`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listRenders: (projectId: string) =>
    browserFetch<import("./types").ProjectRender[]>(
      `api/projects/${encodeURIComponent(projectId)}/renders`,
    ),
  getRender: (projectId: string, renderId: string) =>
    browserFetch<import("./types").ProjectRender>(
      `api/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(renderId)}`,
    ),
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
  // Cancel at period end. Access — including a free trial's remaining days — continues
  // in full until then; only the renewal stops.
  cancelSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/cancel", {
      method: "POST",
    }),
  // Undo a scheduled cancellation. Works for a trial or an admin-granted plan; for a paid
  // plan already cancelled at Razorpay the backend explains that the gateway can't
  // un-cancel and the customer should subscribe again (the current period is unaffected).
  resumeSubscription: () =>
    browserFetch<import("./types").SubscriptionSummary>("api/billing/subscriptions/resume", {
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
  // A shop-onboarded customer asking their shop to add another project. This is what
  // they get instead of a Checkout button: the projects on their code were assigned and
  // paid for by the shop, which can add one in a click.
  requestMoreProjects: () =>
    browserFetch<void>("api/me/request-more-projects", { method: "POST" }),
  // --- Buying one extra project ---
  // What a project costs THIS account on both rails (points and money), what a reopen
  // costs, the balance to weigh them against, and how many paid-for projects are waiting.
  // The price falls with the caller's plan, so it is always read from here rather than
  // held as a constant in the UI.
  getProjectPurchaseOptions: () =>
    browserFetch<import("./types").ProjectPurchaseOptions>("api/billing/points/project-options"),
  // Paying with money instead of points. Only the caller travels — the amount is priced
  // server-side from their plan, so the browser can never name its own price.
  // `credits` buys one project or a bundle of three for two projects' money. No other
  // quantity is priced: the server refuses anything else rather than multiplying a
  // number the browser chose.
  createProjectOrder: (credits = 1) =>
    browserFetch<import("./types").ProjectOrder>(
      `api/billing/projects/order?credits=${credits}`,
      { method: "POST" },
    ),
  verifyProjectPurchase: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").ProjectPurchaseOptions>("api/billing/projects/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // --- Points: a shop's own balance. Earned at the kiosk or bought at ₹1 each, spent on
  // extra projects and reopens, expiring a year after they arrive.
  // Retailers only — a customer account gets 403 from all of these.
  getRewardPoints: () =>
    browserFetch<import("./types").RewardPointsSummary>("api/billing/points"),
  // Buying: only the COUNT travels. The amount is priced server-side from it, so the
  // browser can never name its own price.
  createPointsOrder: (points: number) =>
    browserFetch<import("./types").PointsOrder>("api/billing/points/order", {
      method: "POST",
      body: JSON.stringify({ points }),
    }),
  verifyPointsPurchase: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").RewardPointsSummary>("api/billing/points/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // One extra project, paid in points at the caller's plan rate. Added to a live plan's
  // allowance when there is one, issued as a standalone credit when there isn't.
  pointsPayProjectCredit: () =>
    browserFetch<import("./types").ProjectPurchaseOptions>("api/billing/points/pay/project-credit", {
      method: "POST",
    }),
  // Reopening with money instead of points. The order is refused up-front (409) when the
  // project is already workable, so nobody pays to unlock something a plan already covers.
  createReopenOrder: (projectId: string) =>
    browserFetch<import("./types").ProjectOrder>(
      `api/billing/projects/${encodeURIComponent(projectId)}/reopen/order`,
      { method: "POST" },
    ),
  verifyReopen: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<import("./types").ProjectReopenResult>("api/billing/projects/reopen/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // One more AI image on a project that spent the one it came with. Refused up-front
  // (409) while a render is still unspent, so nobody buys one they already have.
  createRenderOrder: (projectId: string) =>
    browserFetch<import("./types").ProjectOrder>(
      `api/billing/projects/${encodeURIComponent(projectId)}/renders/order`,
      { method: "POST" },
    ),
  verifyRenderPurchase: (body: { orderId: string; paymentId: string; signature: string }) =>
    browserFetch<void>("api/billing/projects/renders/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /**
   * Tell the backend what happened to a Razorpay Checkout — that it opened, that the
   * buyer closed it without paying, or that the card was refused.
   *
   * The server cannot observe any of those: no order is placed and no webhook fires, so
   * every abandoned checkout used to leave no trace at all. This is what puts them in the
   * admin payment audit.
   *
   * Never throws. It is called from `finally`-shaped paths around real payment code, and
   * a bookkeeping call that could reject would turn a successful purchase into an error
   * on screen. A lost report costs one row in a report; a thrown one costs a sale.
   */
  reportCheckoutEvent: async (reference: string, body: CheckoutEventBody): Promise<void> => {
    try {
      await browserFetch<void>(
        `api/billing/attempts/${encodeURIComponent(reference)}/events`,
        { method: "POST", body: JSON.stringify(body) },
      );
    } catch {
      // Deliberately silent — see above.
    }
  },
  pointsPayProjectReopen: (projectId: string) =>
    browserFetch<import("./types").ProjectReopenResult>(
      `api/billing/points/pay/project-reopen/${encodeURIComponent(projectId)}`,
      { method: "POST" },
    ),
  // Companies that actually have shades in the catalogue (name + slug + count).
  listShadeBrands: () =>
    browserFetch<import("./types").ShadeBrandSummary[]>("api/shades/brands"),
  // The shop's OWN companies — what its distributor assigned it, not the whole
  // catalogue. Anywhere a shop is choosing what to hand a customer must use this:
  // offering a company it cannot sell from is a promise it cannot keep.
  listMyShadeBrands: () =>
    browserFetch<import("./types").ShadeBrandSummary[]>("api/shades/mine/brands"),
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
  updateShopProduct: (
    orgId: string,
    productId: string,
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
    browserFetch<ShopProduct>(`api/organizations/${encodeURIComponent(orgId)}/products/${encodeURIComponent(productId)}`, {
      method: "PUT",
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
  // Every room created against a code, newest first. A retailer-assigned code can
  // carry several projects, so the shop needs the whole list — not just the first.
  listProjectsForCode: (codeId: string) =>
    browserFetch<ProjectDetail[]>(
      `api/access-codes/${encodeURIComponent(codeId)}/projects`,
    ),
  createAccessCode: (
    orgId: string,
    body: {
      customerName: string;
      projectQuota: number;
      allowedBrands?: string[];
      allowedProductIds?: string[];
    },
  ) =>
    browserFetch<AccessCode>(`api/organizations/${encodeURIComponent(orgId)}/access-codes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Cancel a code nobody has redeemed yet — its held image credits go straight back to
  // the shop's monthly quota, so fixing a mistyped code no longer costs the quota twice.
  revokeAccessCode: (orgId: string, codeId: string) =>
    browserFetch<AccessCode>(
      `api/organizations/${encodeURIComponent(orgId)}/access-codes/${encodeURIComponent(codeId)}`,
      { method: "DELETE" },
    ),
  // Top up a code the customer already HOLDS with more projects, so a "one more room"
  // at the counter doesn't mean a second set of digits to type. Works on redeemed
  // codes — that is the point. Each added project reserves an image credit, so the
  // shop needs a live plan (402 SUBSCRIPTION_REQUIRED without one).
  grantAccessCodeProjects: (orgId: string, codeId: string, projects: number) =>
    browserFetch<AccessCode>(
      `api/organizations/${encodeURIComponent(orgId)}/access-codes/${encodeURIComponent(codeId)}/projects`,
      { method: "POST", body: JSON.stringify({ projects }) },
    ),
  // Give a code another 10 days, and move the customer's access window with it.
  // Resets the window rather than adding to it, so a code never carries more than the
  // 10 days it promised however often it is renewed. Free — the projects were already
  // paid for — but still needs a live plan.
  extendAccessCode: (orgId: string, codeId: string) =>
    browserFetch<AccessCode>(
      `api/organizations/${encodeURIComponent(orgId)}/access-codes/${encodeURIComponent(codeId)}/extend`,
      { method: "POST" },
    ),
  // Amend a not-yet-redeemed code. The assigned project count is fixed once issued (it is
  // backed by held image credits) — cancel and re-issue to change it.
  updateAccessCode: (
    orgId: string,
    codeId: string,
    body: {
      customerName: string;
      projectQuota: number;
      allowedBrands?: string[];
      allowedProductIds?: string[];
    },
  ) =>
    browserFetch<AccessCode>(
      `api/organizations/${encodeURIComponent(orgId)}/access-codes/${encodeURIComponent(codeId)}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  // Customer: the companies + individual products the retailer unlocked on my code.
  getAssignedProducts: () =>
    browserFetch<import("./types").AssignedProducts>("api/me/assigned-products"),
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
  // --- Retailer: which paint companies the shop actually shows ---
  // The options are the DISTRIBUTOR's grant, not the whole catalogue: a shop cannot
  // display a company it was never assigned. Saving applies everywhere its catalogue
  // is read — the counter's studio, the kiosk, its access codes and its customers.
  getVisibleBrands: (orgId: string) =>
    browserFetch<import("./types").ShopBrandVisibility>(
      `api/organizations/${encodeURIComponent(orgId)}/visible-brands`,
    ),
  setVisibleBrands: (orgId: string, body: { showAll: boolean; brandIds?: number[] }) =>
    browserFetch<import("./types").ShopBrandVisibility>(
      `api/organizations/${encodeURIComponent(orgId)}/visible-brands`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  // --- Retailer: public store kiosk links + earnings wallet ---
  listStoreLinks: (orgId: string) =>
    browserFetch<import("./types").StoreLink[]>(
      `api/organizations/${encodeURIComponent(orgId)}/store-links`,
    ),
  createStoreLink: (orgId: string, body: { validDays?: number }) =>
    browserFetch<import("./types").StoreLink>(
      `api/organizations/${encodeURIComponent(orgId)}/store-links`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateStoreLink: (linkId: string, body: { validDays?: number; active?: boolean }) =>
    browserFetch<import("./types").StoreLink>(
      `api/store-links/${encodeURIComponent(linkId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  getWallet: (orgId: string) =>
    browserFetch<import("./types").WalletSummary>(
      `api/organizations/${encodeURIComponent(orgId)}/wallet`,
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
  // Each granted project reserves one image credit against the shop's plan — exactly
  // like issuing a code — so this needs a live subscription (402 without one).
  grantProject: (orgId: string, customerId: string, projects = 1) =>
    browserFetch<CustomerEntitlement>(
      `api/organizations/${encodeURIComponent(orgId)}/customers/${encodeURIComponent(customerId)}/grant-project`,
      { method: "POST", body: JSON.stringify({ projects }) },
    ),
  // Everything this shop has given away, each flagged with whether it can still come back.
  listProjectGrants: (orgId: string) =>
    browserFetch<import("./types").ProjectGrant[]>(
      `api/organizations/${encodeURIComponent(orgId)}/project-grants`,
    ),
  // Take a grant back: returns the reserved images to the shop's quota. Refused once the
  // customer has used the projects, and refused after the funding period has renewed.
  revokeProjectGrant: (orgId: string, grantId: string) =>
    browserFetch<import("./types").ProjectGrant>(
      `api/organizations/${encodeURIComponent(orgId)}/project-grants/${encodeURIComponent(grantId)}`,
      { method: "DELETE" },
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
  // Prefer this over chargePdfDownload: a board charged through the bare endpoint is
  // not recorded, so it never becomes a combination and never closes anything.
  recordColourBoard: (projectId: string, pages: import("./types").ColourBoardPage[]) =>
    browserFetch<import("./types").ColourBoardResult>(
      `api/guest/projects/${encodeURIComponent(projectId)}/colour-boards`,
      { method: "POST", body: JSON.stringify({ pages }) },
    ),
};

export { HttpError };
