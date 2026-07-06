/**
 * DEMO_MODE handler for the `serverFetch` boundary (server actions in
 * src/lib/auth.ts + billingApi/adminApi/guestServerApi). Answers the auth and
 * billing endpoints from fixtures and throws HttpError for the realistic error
 * cases (bad login → 401, no subscription for a customer → 404, …).
 */
import { HttpError } from "../http-error";
import type {
  AuthResponse,
  GuestRedeemResult,
  UserProfile,
} from "../types";
import {
  authResponseFor,
  authenticateDemo,
  decodeDemoToken,
  demoUserFromToken,
  DEMO_EXPIRES_IN,
  type DemoRole,
} from "./accounts";
import { getStore } from "./store";

type Init = RequestInit & { accessToken?: string };

function parseBody<T = Record<string, unknown>>(init: Init): T {
  if (typeof init.body === "string" && init.body.length > 0) {
    try {
      return JSON.parse(init.body) as T;
    } catch {
      /* fall through */
    }
  }
  return {} as T;
}

function normalize(path: string): string {
  return ("/" + path.replace(/^\/+/, "")).replace(/\/+$/, "") || "/";
}

export async function demoServerFetch<T>(path: string, init: Init = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const p = normalize(path);
  const token = init.accessToken ?? null;

  // --- Auth ---
  if (p === "/api/auth/login" && method === "POST") {
    const { email = "", password = "" } = parseBody<{ email?: string; password?: string }>(init);
    const auth = authenticateDemo(email, password);
    if (!auth) throw new HttpError(401, "Incorrect email or password.");
    return auth as T;
  }

  if (p === "/api/auth/register" && method === "POST") {
    const { accountType } = parseBody<{ accountType?: string }>(init);
    const role: DemoRole = accountType === "customer" ? "CUSTOMER" : "RETAILER";
    return authResponseFor(role) as T;
  }

  if (p === "/api/auth/refresh" && method === "POST") {
    const { refreshToken } = parseBody<{ refreshToken?: string }>(init);
    const user = decodeDemoToken(refreshToken);
    if (!user) throw new HttpError(401, "Session expired.");
    return authResponseFor(user.role) as T;
  }

  if (p === "/api/auth/logout" && method === "POST") {
    return { message: "Signed out." } as T;
  }

  if (p === "/api/auth/account" && method === "DELETE") {
    return undefined as T;
  }

  if (p === "/api/auth/me") {
    return { userId: demoUserFromToken(token).id } as T;
  }

  if (p === "/api/auth/profile") {
    return demoUserFromToken(token) as UserProfile as T;
  }

  // --- Billing (server-side subscription gate) ---
  if (p === "/api/billing/subscriptions/current") {
    const user = demoUserFromToken(token);
    // Customers are not subscription accounts → 404 (page redirects to pricing).
    if (user.role === "CUSTOMER") throw new HttpError(404, "No subscription.");
    return getStore().subscription as T;
  }

  // --- Customer entitlement (server-side studio access gate) ---
  if (p === "/api/me/entitlement") {
    const user = demoUserFromToken(token);
    // Non-customers have no entitlement; the demo customer has the seeded one so
    // the studio gate lets her straight in.
    return (user.role === "CUSTOMER" ? getStore().entitlement : null) as T;
  }

  // --- Admin: provision a shop (echo a created retailer) ---
  if (p === "/api/admin/retailers" && method === "POST") {
    const { name = "Shop owner", email = "owner@example.in" } = parseBody<{ name?: string; email?: string }>(init);
    return { id: `usr_${Date.now()}`, name, email, role: "RETAILER" } as T;
  }

  // --- Anonymous guest redemption of a shop access code ---
  if (p === "/api/access-codes/redeem-guest" && method === "POST") {
    const { code = "" } = parseBody<{ code?: string }>(init);
    const want = code.trim().toUpperCase();
    const match = getStore().accessCodes.find((c) => c.code.toUpperCase() === want);
    if (!match) throw new HttpError(404, "That code wasn't found.");
    if (match.used) throw new HttpError(409, "That code has already been used.");
    if (match.expired) throw new HttpError(404, "That code has expired.");
    const result: GuestRedeemResult = {
      guestToken: `hvdemo-guest.${match.id}`,
      code: match.code,
      shopName: match.organizationName ?? "Mehta Paints",
      validDays: match.validDays,
      expiresAt: match.expiresAt ?? new Date(Date.now() + match.validDays * 86_400_000).toISOString(),
      allowedBrands: match.allowedBrands,
    };
    return result as T;
  }

  if (p === "/api/projects/claim-guest" && method === "POST") {
    return { linked: 1 } as T;
  }

  // Anything else the demo doesn't model: behave like a 404 the callers tolerate.
  throw new HttpError(404, `Demo: no fixture for ${method} ${p}`);
}

export type { AuthResponse };
