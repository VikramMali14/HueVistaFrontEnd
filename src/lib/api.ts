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
  ApiError,
  AuthResponse,
  CustomerEntitlement,
  OrgResponse,
  ProjectCreditOrder,
  ProjectDetail,
  RegionColorUpdate,
  UploadedImage,
  UserProfile,
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
  register: (body: { name: string; email: string; password: string }) =>
    serverFetch<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
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
 * Browser API — used from client components. Calls the same-origin BFF proxy
 * which handles auth, refresh and rate limiting.
 */
export const api = {
  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return browserFetch<UploadedImage>("api/images/upload", { method: "POST", body: form });
  },
  listImages: () => browserFetch<UploadedImage[]>("api/images"),
  getImage: (id: string) =>
    browserFetch<UploadedImage>(`api/images/${encodeURIComponent(id)}`),
  createProject: (body: { imageId: string; name?: string }) =>
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
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[]) =>
    browserFetch<ProjectDetail>(`api/projects/${encodeURIComponent(projectId)}/regions`, {
      method: "PUT",
      body: JSON.stringify(updates),
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
  // --- Retailer: manage the customers they onboarded ---
  listMyOrgs: () => browserFetch<OrgResponse[]>("api/organizations/mine"),
  listCustomers: (orgId: string) =>
    browserFetch<CustomerEntitlement[]>(`api/organizations/${encodeURIComponent(orgId)}/customers`),
  grantProject: (orgId: string, customerId: string) =>
    browserFetch<CustomerEntitlement>(
      `api/organizations/${encodeURIComponent(orgId)}/customers/${encodeURIComponent(customerId)}/grant-project`,
      { method: "POST" },
    ),
};

export { HttpError };
