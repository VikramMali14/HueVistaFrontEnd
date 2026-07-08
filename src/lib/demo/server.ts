/**
 * DEMO_MODE handler for the `serverFetch` boundary (server actions in
 * src/lib/auth.ts + billingApi/adminApi/guestServerApi). Answers the auth and
 * billing endpoints from fixtures and throws HttpError for the realistic error
 * cases (bad login → 401, no subscription for a customer → 404, …).
 */
import { HttpError } from "../http-error";
import type {
  AccessCode,
  AuthResponse,
  GuestRedeemResult,
  StoreCheckoutResult,
  StoreOrder,
  StorePublicInfo,
  UserProfile,
} from "../types";
import {
  authResponseFor,
  authenticateDemo,
  decodeDemoToken,
  demoUserFromToken,
  type DemoRole,
} from "./accounts";
import { getStore, nextId, nextSeq } from "./store";

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
  const bare = path.split("?")[0] ?? path;
  return ("/" + bare.replace(/^\/+/, "")).replace(/\/+$/, "") || "/";
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

  // --- Public shop-account lead form (/trial) ---
  if (p === "/api/leads/shop" && method === "POST") {
    return { id: `lead_${Date.now()}`, status: "NEW" } as T;
  }

  // --- Public in-store kiosk (/store/<slug>) ---
  const storeMatch = p.match(/^\/api\/store\/([^/]+)(?:\/(order|verify))?$/);
  if (storeMatch) {
    const link = getStore().storeLinks.find((l) => l.slug === storeMatch[1]);
    if (!link) throw new HttpError(404, "Store link not found.");
    if (!storeMatch[2] && method === "GET") {
      const info: StorePublicInfo = {
        slug: link.slug,
        shopName: link.organizationName ?? "Mehta Paints",
        pricePaise: link.pricePaise,
        currency: link.currency,
        validDays: link.validDays,
        active: link.active,
        paymentsConfigured: true,
      };
      return info as T;
    }
    if (storeMatch[2] === "order" && method === "POST") {
      const order: StoreOrder = {
        orderId: nextId("order"),
        amount: link.pricePaise,
        currency: link.currency,
        razorpayKeyId: "rzp_test_demo",
        shopName: link.organizationName ?? "Mehta Paints",
      };
      return order as T;
    }
    if (storeMatch[2] === "verify" && method === "POST") {
      // Simulate a verified kiosk payment: issue a pickup code, credit the wallet.
      const store = getStore();
      const code: AccessCode = {
        id: nextId("ac"),
        code: `MEHTA${9000 + (nextSeq() % 1000)}`,
        organizationId: link.organizationId,
        organizationName: link.organizationName ?? "Mehta Paints",
        validDays: link.validDays,
        expiresAt: new Date(Date.now() + link.validDays * 86_400_000).toISOString(),
        used: false,
        expired: false,
        createdAt: new Date().toISOString(),
      };
      store.accessCodes.unshift(code);
      const share = Math.max(0, link.pricePaise - store.wallet.platformFeePaise);
      store.wallet.lifetimeEarnedPaise += share;
      store.wallet.balancePaise += share;
      store.wallet.recentPayments.unshift({
        id: nextId("sp"), amountPaise: link.pricePaise, retailerSharePaise: share,
        code: code.code, createdAt: new Date().toISOString(),
      });
      const result: StoreCheckoutResult = {
        guestToken: `hvdemo-guest.${code.id}`,
        code: code.code,
        shopName: link.organizationName ?? "Mehta Paints",
        validDays: link.validDays,
        expiresAt: code.expiresAt!,
        amountPaise: link.pricePaise,
      };
      return result as T;
    }
  }

  // --- Admin: the wallet payout queue ---
  if (p === "/api/admin/wallet/redemptions" && method === "GET") {
    return getStore().wallet.redemptions as T;
  }
  const decisionMatch = p.match(/^\/api\/admin\/wallet\/redemptions\/([^/]+)\/decision$/);
  if (decisionMatch && method === "POST") {
    const wallet = getStore().wallet;
    const redemption = wallet.redemptions.find((r) => r.id === decisionMatch[1]);
    if (!redemption) throw new HttpError(404, "Redemption not found.");
    if (redemption.status !== "PENDING") {
      throw new HttpError(409, `This redemption was already ${redemption.status.toLowerCase()}.`);
    }
    const { approve = true, note } = parseBody<{ approve?: boolean; note?: string }>(init);
    redemption.status = approve ? "APPROVED" : "REJECTED";
    redemption.decidedAt = new Date().toISOString();
    if (note) redemption.adminNote = note;
    // Mirror the backend derivation: approval spends the held funds; rejection returns them.
    wallet.pendingRedemptionPaise -= redemption.amountPaise;
    if (approve) wallet.redeemedPaise += redemption.amountPaise;
    else wallet.balancePaise += redemption.amountPaise;
    return redemption as T;
  }

  // Anything else the demo doesn't model: behave like a 404 the callers tolerate.
  throw new HttpError(404, `Demo: no fixture for ${method} ${p}`);
}

export type { AuthResponse };
