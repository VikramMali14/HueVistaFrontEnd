import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Whether a paint shop stands behind a customer account — the one question that
 * decides if "My products" exists at all. The tab is hidden without a shop, and the
 * page bounces to the dashboard, because the products on it are assigned by a shop
 * and an account that redeemed no code has none.
 *
 * Both of those guards were already written, and neither of them fired, because the
 * question underneath answered "linked" for every customer alive. The backend says
 * "no entitlement" with `ResponseEntity.ok(null)` — a 200 with NO BODY, not the JSON
 * literal `null` — and an empty body reaches the app as `undefined`. The verdict was
 * `!== null`, which `undefined` passes. So a shopless customer was told a shop stood
 * behind them: the tab appeared, the page opened, and only the fetch behind it
 * finally 404'd, into an empty state that looked like a shop had assigned nothing.
 *
 * These tests speak the empty 200 the real backend sends, rather than the tidy `null`
 * the type declared, which is the only version that ever caught this.
 */

const cookieJar = { get: () => ({ value: "access-token" }) };
vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { entitlementApi } = await import("@/lib/api");
const { customerShopStatus } = await import("@/lib/auth");

/** What Spring actually puts on the wire for a null body: 200, zero bytes. */
const emptyOk = () => new Response(null, { status: 200 });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("entitlementApi.my", () => {
  it("reads an empty 200 as null, not undefined", async () => {
    fetchMock.mockResolvedValue(emptyOk());

    await expect(entitlementApi.my("access-token")).resolves.toBeNull();
  });

  it("still passes an entitlement through untouched", async () => {
    fetchMock.mockResolvedValue(Response.json({ projectAllowance: 3, projectsCreated: 1, expired: false }));

    await expect(entitlementApi.my("access-token")).resolves.toMatchObject({ projectAllowance: 3 });
  });
});

describe("customerShopStatus", () => {
  it("says none for a customer the backend answers with an empty body", async () => {
    fetchMock.mockResolvedValue(emptyOk());

    await expect(customerShopStatus()).resolves.toBe("none");
  });

  it("says linked for a customer holding an entitlement", async () => {
    fetchMock.mockResolvedValue(Response.json({ projectAllowance: 3, projectsCreated: 0, expired: false }));

    await expect(customerShopStatus()).resolves.toBe("linked");
  });

  /**
   * The failure that must not become a verdict. Reading a backend blip as "no shop"
   * would evict a customer who redeemed a code last week from the page their code
   * bought them — so an unreadable entitlement leaves the page open and lets the view
   * behind it report the failure itself.
   */
  it("says unknown when the entitlement cannot be read at all", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    await expect(customerShopStatus()).resolves.toBe("unknown");
  });
});
