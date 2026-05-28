/**
 * Typed API client for the HueVista backend.
 *
 * Two flavours:
 *  - `serverFetch` for use inside server components / server actions
 *    (talks directly to the backend, reads cookies for tokens)
 *  - `browserFetch` for client components (goes through `/api/*` rewrites
 *    so the API origin never reaches the browser bundle, and the access
 *    token is held in memory only)
 */

import { config } from "./config";
import type {
  ApiError,
  AuthResponse,
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

export async function browserFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const res = await fetch(path.startsWith("/") ? path : `/${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body && !(rest.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

export async function serverFetch<T>(
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

export const api = {
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

  uploadImage: async (file: File, accessToken: string) => {
    const form = new FormData();
    form.append("file", file);
    return browserFetch<UploadedImage>("/api/images/upload", { method: "POST", body: form, accessToken });
  },
  listImages: (accessToken: string) =>
    browserFetch<UploadedImage[]>("/api/images", { accessToken }),
  getImage: (id: string, accessToken: string) =>
    browserFetch<UploadedImage>(`/api/images/${encodeURIComponent(id)}`, { accessToken }),

  createProject: (body: { imageId: string; name?: string }, accessToken: string) =>
    browserFetch<ProjectDetail>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
      accessToken,
    }),
  requestSegmentation: (projectId: string, accessToken: string) =>
    browserFetch<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}/segment`, {
      method: "POST",
      accessToken,
    }),
  getProjectStatus: (projectId: string, accessToken: string) =>
    browserFetch<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}/status`, {
      accessToken,
    }),
  getProject: (projectId: string, accessToken: string) =>
    browserFetch<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}`, {
      accessToken,
    }),
  updateRegionColors: (projectId: string, updates: RegionColorUpdate[], accessToken: string) =>
    browserFetch<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}/regions`, {
      method: "PUT",
      body: JSON.stringify(updates),
      accessToken,
    }),
};

export { HttpError };
