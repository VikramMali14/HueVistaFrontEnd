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
  NetworkNode,
  NetworkReport,
  RetailerBrandOption,
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
import { DEMO_BRANDS } from "./data";
import { getStore, nextId, nextSeq } from "./store";

// ── Demo hierarchy (network report + brand assignments) ──────────────────
// A distributor grants each shop a set of paint brands. Seeded with a partial
// selection so the editor demoes a real state; PUT mutates it for the session.
const demoShopBrands: Record<string, Set<number>> = {
  org_demo: new Set<number>([1, 2]), // Asian Paints, Berger
};

function assignedBrandNames(orgId: string): string[] {
  const ids = demoShopBrands[orgId];
  if (!ids || ids.size === 0) return [];
  return DEMO_BRANDS.filter((b) => ids.has(b.id)).map((b) => b.name);
}

function demoBrandOptions(orgId: string): RetailerBrandOption[] {
  const ids = demoShopBrands[orgId] ?? new Set<number>();
  return DEMO_BRANDS.map((b) => ({ id: b.id, name: b.name, slug: b.slug, assigned: ids.has(b.id) }));
}

function demoPainterNode(name: string, email: string, joinedAt: string): NetworkNode {
  return {
    userId: `usr_${email}`, name, email, phone: null, role: "PAINTER", joinedAt,
    orgId: null, orgName: null, city: null, state: null,
    retailerCount: 0, painterCount: 0, codesIssued: 0, codesRedeemed: 0, children: [],
  };
}

function demoShopNode(): NetworkNode {
  const painters = [
    demoPainterNode("Santosh Pawar", "santosh.pawar@gmail.com", "2026-03-14T10:00:00+05:30"),
    demoPainterNode("Imran Shaikh", "imran.shaikh@gmail.com", "2026-04-02T10:00:00+05:30"),
  ];
  return {
    userId: "usr_mehta", name: "Rajesh Mehta", email: "rajesh@mehtapaints.in", phone: "+91 98860 12345",
    role: "RETAILER", joinedAt: "2025-11-02T09:30:00+05:30",
    orgId: "org_demo", orgName: "Mehta Paints", city: "Pune", state: "Maharashtra",
    retailerCount: 0, painterCount: painters.length, codesIssued: 3, codesRedeemed: 1,
    assignedBrands: assignedBrandNames("org_demo"), children: painters,
  };
}

function demoNetworkReport(role: DemoRole): NetworkReport {
  const shop = demoShopNode();
  if (role === "RETAILER") {
    return {
      viewerRole: "RETAILER",
      totals: { painters: shop.painterCount, codesIssued: shop.codesIssued, codesRedeemed: shop.codesRedeemed },
      roots: [shop],
    };
  }
  // ADMIN sees the whole chain: a distributor with the demo shop under it.
  const distributor: NetworkNode = {
    userId: "usr_vaibhav", name: "Vaibhav Kulkarni", email: "vaibhav@apexdistributors.in",
    phone: "+91 98220 33445", role: "DISTRIBUTOR", joinedAt: "2025-10-01T09:00:00+05:30",
    orgId: "org_dist_demo", orgName: "Apex Paint Distributors", city: "Pune", state: "Maharashtra",
    retailerCount: 1, painterCount: shop.painterCount, codesIssued: shop.codesIssued,
    codesRedeemed: shop.codesRedeemed, children: [shop],
  };
  return {
    viewerRole: "ADMIN",
    totals: { distributors: 1, retailers: 1, painters: shop.painterCount, customers: 3,
      codesIssued: shop.codesIssued, codesRedeemed: shop.codesRedeemed },
    roots: [distributor],
  };
}

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

  // --- No-login redemption that auto-creates a customer account and signs in ---
  if (p === "/api/access-codes/redeem-account" && method === "POST") {
    const { code = "" } = parseBody<{ code?: string }>(init);
    const want = code.trim().toUpperCase();
    const match = getStore().accessCodes.find((c) => c.code.toUpperCase() === want);
    if (!match) throw new HttpError(404, "That code wasn't found.");
    if (match.expired) throw new HttpError(410, "That code has expired.");
    const auth = authResponseFor("CUSTOMER");
    return {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      tokenType: "Bearer",
      expiresIn: auth.expiresIn,
      user: auth.user,
      shopName: match.organizationName ?? "Mehta Paints",
      validDays: match.validDays,
      customerName: match.customerName ?? auth.user.name,
    } as T;
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

  // --- Hierarchy: network report ---
  if (p === "/api/hierarchy/network" && method === "GET") {
    const user = demoUserFromToken(token);
    if (user.role === "CUSTOMER") throw new HttpError(403, "The network report is for shops and up.");
    return demoNetworkReport(user.role) as T;
  }

  // --- Hierarchy: a shop's brand assignments (distributor/admin) ---
  const brandMatch = p.match(/^\/api\/hierarchy\/retailers\/([^/]+)\/brands$/);
  if (brandMatch) {
    const user = demoUserFromToken(token);
    // The demo has no distributor account, so ADMIN stands in as the manager.
    if (user.role !== "ADMIN") {
      throw new HttpError(403, "Only admins and distributors can manage a shop's brands.");
    }
    const orgId = decodeURIComponent(brandMatch[1]!);
    if (method === "PUT") {
      const { brandIds = [] } = parseBody<{ brandIds?: number[] }>(init);
      demoShopBrands[orgId] = new Set<number>(brandIds.filter((n) => typeof n === "number"));
      return demoBrandOptions(orgId) as T;
    }
    if (method === "GET") {
      return demoBrandOptions(orgId) as T;
    }
  }

  // Anything else the demo doesn't model: behave like a 404 the callers tolerate.
  throw new HttpError(404, `Demo: no fixture for ${method} ${p}`);
}

export type { AuthResponse };
