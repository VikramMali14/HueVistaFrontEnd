/**
 * DEMO_MODE handler for the `serverFetch` boundary (server actions in
 * src/lib/auth.ts + billingApi/adminApi/kioskServerApi). Answers the auth and
 * billing endpoints from fixtures and throws HttpError for the realistic error
 * cases (bad login → 401, no subscription for a customer → 404, …).
 */
import { HttpError } from "../http-error";
import type {
  AccessCode,
  AuthResponse,
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
    retailerCount: 0, painterCount: 0, customerCount: 0, codesIssued: 0, codesRedeemed: 0, children: [],
  };
}

/**
 * A walk-in the demo shop signed up. The three below are deliberately one of each
 * state the customers table separates — working, never started, lapsed — so the
 * demo shows what the Activity filter is for rather than three identical rows.
 */
function demoCustomerNode(
  name: string,
  joinedAt: string,
  used: number,
  allowance: number,
  accessExpiresAt: string,
): NetworkNode {
  return {
    userId: `usr_cust_${name.toLowerCase().replace(/\s+/g, "_")}`,
    name, email: null, phone: null, role: "CUSTOMER", joinedAt,
    orgId: null, orgName: null, city: null, state: null,
    retailerCount: 0, painterCount: 0, customerCount: 0, codesIssued: 0, codesRedeemed: 0,
    projectAllowance: allowance, projectsUsed: used, accessExpiresAt, children: [],
  };
}

function demoShopNode(): NetworkNode {
  const painters = [
    demoPainterNode("Santosh Pawar", "santosh.pawar@gmail.com", "2026-03-14T10:00:00+05:30"),
    demoPainterNode("Imran Shaikh", "imran.shaikh@gmail.com", "2026-04-02T10:00:00+05:30"),
  ];
  const customers = [
    demoCustomerNode("Anjali Deshpande", "2026-06-18T11:00:00+05:30", 2, 3, "2026-09-18T11:00:00+05:30"),
    demoCustomerNode("Farhan Qureshi", "2026-07-02T16:20:00+05:30", 0, 1, "2026-10-02T16:20:00+05:30"),
    demoCustomerNode("Meera Nair", "2026-01-09T13:45:00+05:30", 1, 1, "2026-04-09T13:45:00+05:30"),
  ];
  return {
    userId: "usr_mehta", name: "Rajesh Mehta", email: "rajesh@mehtapaints.in", phone: "+91 98860 12345",
    role: "RETAILER", joinedAt: "2025-11-02T09:30:00+05:30",
    orgId: "org_demo", orgName: "Mehta Paints", city: "Pune", state: "Maharashtra",
    retailerCount: 0, painterCount: painters.length, customerCount: customers.length,
    codesIssued: 3, codesRedeemed: 1,
    assignedBrands: assignedBrandNames("org_demo"), children: [...painters, ...customers],
  };
}

function demoNetworkReport(role: DemoRole): NetworkReport {
  const shop = demoShopNode();
  if (role === "RETAILER") {
    return {
      viewerRole: "RETAILER",
      totals: {
        painters: shop.painterCount, customers: shop.customerCount,
        codesIssued: shop.codesIssued, codesRedeemed: shop.codesRedeemed,
      },
      roots: [shop],
    };
  }
  // ADMIN sees the whole chain: a distributor with the demo shop under it.
  const distributor: NetworkNode = {
    userId: "usr_vaibhav", name: "Vaibhav Kulkarni", email: "vaibhav@apexdistributors.in",
    phone: "+91 98220 33445", role: "DISTRIBUTOR", joinedAt: "2025-10-01T09:00:00+05:30",
    orgId: "org_dist_demo", orgName: "Apex Paint Distributors", city: "Pune", state: "Maharashtra",
    retailerCount: 1, painterCount: shop.painterCount, customerCount: shop.customerCount,
    codesIssued: shop.codesIssued, codesRedeemed: shop.codesRedeemed, children: [shop],
  };
  return {
    viewerRole: "ADMIN",
    totals: { distributors: 1, retailers: 1, painters: shop.painterCount,
      customers: shop.customerCount,
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

  // --- A signed-in customer adding a code to the account they already hold ---
  if (p === "/api/access-codes/redeem" && method === "POST") {
    const { code = "" } = parseBody<{ code?: string }>(init);
    const want = code.trim().toUpperCase();
    const match = getStore().accessCodes.find((c) => c.code.toUpperCase() === want);
    if (!match) throw new HttpError(404, "That code wasn't found.");
    if (match.used) throw new HttpError(409, "That access code has already been used.");
    if (match.expired) throw new HttpError(409, "That access code has expired.");
    return { ...match, used: true, usedAt: new Date().toISOString() } as T;
  }

  // --- Kiosk re-entry: email me a sign-in code, then redeem it ---
  // Answers identically whether or not the address bought anything, exactly as the
  // real endpoint does — the demo must not teach a shape the backend refuses to have.
  if (p === "/api/store/re-entry" && method === "POST") {
    return { sent: true, expiresInSeconds: 1200, cooldownSeconds: 60 } as T;
  }

  if (p === "/api/store/re-entry/confirm" && method === "POST") {
    const { code = "" } = parseBody<{ code?: string }>(init);
    if (code.trim().length !== 6) throw new HttpError(400, "Incorrect code. 4 attempts left.");
    return authResponseFor("CUSTOMER") as T;
  }

  // --- Folding a kiosk account into the signed-in one ---
  if (p === "/api/me/merge-guest-account" && method === "POST") {
    return {
      mergedFromUserId: "usr_demo_kiosk",
      projectsMoved: 1,
      imagesMoved: 1,
      projectAllowanceMoved: 1,
      aiCreditsMoved: 0,
      shopName: "Mehta Paints",
    } as T;
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
        pricePaise: getStore().wallet.kioskPricePaise,
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
        amount: getStore().wallet.kioskPricePaise,
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
      // The sale is HueVista's in full; the shop earns points.
      const points = store.wallet.pointsPerSale;
      store.wallet.lifetimePointsEarned += points;
      store.wallet.pointsBalance += points;
      store.wallet.recentPayments.unshift({
        id: nextId("sp"), amountPaise: store.wallet.kioskPricePaise, bonusPoints: points,
        reversed: false, code: code.code, createdAt: new Date().toISOString(),
      });
      const { email } = parseBody<{ email?: string }>(init);
      const result: StoreCheckoutResult = {
        code: code.code,
        shopName: link.organizationName ?? "Mehta Paints",
        validDays: link.validDays,
        expiresAt: code.expiresAt!,
        amountPaise: store.wallet.kioskPricePaise,
        // The walk-in leaves the till already signed in to the account their
        // purchase opened — that is the whole point of the flow.
        session: authResponseFor("CUSTOMER"),
        accountEmail: email?.trim() || null,
        existingAccount: false,
      };
      return result as T;
    }
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

  // --- Admin: marketing-site images ---
  // Modelled rather than 404'd because the point of this feature is that you can
  // see the result, and the offline demo is where most people will first try it.
  // The bytes are held in memory as data URLs, so an upload survives until the
  // dev server restarts and no storage is involved.
  if (p === "/api/admin/site-assets" && method === "GET") {
    requireDemoAdmin(token);
    return demoSiteAssetList() as T;
  }
  const siteAssetMatch = p.match(/^\/api\/admin\/site-assets\/([^/]+)$/);
  if (siteAssetMatch) {
    requireDemoAdmin(token);
    const slot = decodeURIComponent(siteAssetMatch[1]!);
    if (method === "DELETE") {
      delete demoSiteAssets[slot];
      return undefined as T;
    }
    if (method === "POST") {
      const file = init.body instanceof FormData ? init.body.get("file") : null;
      if (!(file instanceof File)) throw new HttpError(422, "Choose an image first.");
      return storeDemoSiteAsset(slot, file) as unknown as T;
    }
  }

  // Anything else the demo doesn't model: behave like a 404 the callers tolerate.
  throw new HttpError(404, `Demo: no fixture for ${method} ${p}`);
}

/* ── Demo site assets (in-memory) ─────────────────────────────────────── */

const demoSiteAssets: Record<string, DemoSiteAsset> = {};

interface DemoSiteAsset {
  slot: string;
  url: string;
  contentType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  updatedAt: string | null;
}

function requireDemoAdmin(token?: string | null) {
  const user = demoUserFromToken(token ?? undefined);
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "Only admins can change the site's images.");
  }
}

function demoSiteAssetList(): DemoSiteAsset[] {
  return Object.values(demoSiteAssets).sort((a, b) => a.slot.localeCompare(b.slot));
}

async function readAsDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
}

/**
 * Held as a data URL because the demo has no storage and no API origin to serve
 * a file from. Dimensions are left null — the real backend reads them off the
 * image, and the admin page already treats "could not read them" as an ordinary
 * case rather than an error.
 */
function storeDemoSiteAsset(slot: string, file: File): Promise<DemoSiteAsset> {
  return readAsDataUrl(file).then((url) => {
    const asset: DemoSiteAsset = {
      slot,
      url,
      contentType: file.type || "image/jpeg",
      fileSize: file.size,
      width: null,
      height: null,
      originalFilename: file.name,
      updatedAt: new Date().toISOString().slice(0, 19),
    };
    demoSiteAssets[slot] = asset;
    return asset;
  });
}

/** The demo's filled slots, for the server-side manifest read. */
export function demoSiteAssetMap(): Record<string, DemoSiteAsset> {
  return { ...demoSiteAssets };
}

/**
 * The demo publishes no rooms.
 *
 * An empty shelf is a real state the gallery already handles — it falls back to
 * the built-in plates, or 404s — so the offline demo gets the honest answer
 * rather than fabricated rooms with invented shade codes, which is the whole
 * reason /gallery was gated in the first place.
 */
export function demoPublishedProjects(): [] {
  return [];
}

export type { AuthResponse };
