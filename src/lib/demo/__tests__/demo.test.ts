import { describe, expect, it } from "vitest";
import { authenticateDemo, DEMO_PASSWORD, encodeDemoToken } from "../accounts";
import { demoServerFetch } from "../server";
import { HttpError } from "../../http-error";
import type { AuthResponse, SubscriptionSummary, UserProfile } from "../../types";

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

describe("demo accounts", () => {
  it("authenticates a known account with the shared password", () => {
    const auth = authenticateDemo("rajesh@mehtapaints.in", DEMO_PASSWORD);
    expect(auth?.user.role).toBe("RETAILER");
    expect(auth?.user.name).toBe("Rajesh Mehta");
    // 7-day token so the access cookie never needs a (non-existent) backend refresh.
    expect(auth?.expiresIn).toBe(60 * 60 * 24 * 7);
    expect(authenticateDemo("admin@huevista.in", DEMO_PASSWORD)?.user.role).toBe("ADMIN");
    expect(authenticateDemo("anjali@example.in", DEMO_PASSWORD)?.user.role).toBe("CUSTOMER");
  });

  it("rejects a wrong password", () => {
    expect(authenticateDemo("rajesh@mehtapaints.in", "nope")).toBeNull();
  });
});

describe("demoServerFetch (server-action boundary)", () => {
  it("logs in valid credentials", async () => {
    const auth = await demoServerFetch<AuthResponse>("/api/auth/login", post({ email: "rajesh@mehtapaints.in", password: DEMO_PASSWORD }));
    expect(auth.user.email).toBe("rajesh@mehtapaints.in");
    expect(auth.accessToken).toContain("RETAILER");
  });

  it("rejects a bad login with a 401 HttpError", async () => {
    await expect(
      demoServerFetch("/api/auth/login", post({ email: "rajesh@mehtapaints.in", password: "wrong" })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns the profile for the token's role", async () => {
    const profile = await demoServerFetch<UserProfile>("/api/auth/profile", {
      accessToken: encodeDemoToken("ADMIN", "usr_asha"),
    });
    expect(profile.role).toBe("ADMIN");
  });

  it("gives RETAILER an ACTIVE subscription but 404s a CUSTOMER", async () => {
    const sub = await demoServerFetch<SubscriptionSummary>("/api/billing/subscriptions/current", {
      accessToken: encodeDemoToken("RETAILER", "usr_mehta"),
    });
    expect(sub.status).toBe("ACTIVE");

    await expect(
      demoServerFetch("/api/billing/subscriptions/current", { accessToken: encodeDemoToken("CUSTOMER", "usr_anjali") }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("redeems the seeded guest access code MEHTA7", async () => {
    const res = await demoServerFetch<{ shopName: string; code: string }>("/api/access-codes/redeem-guest", post({ code: "MEHTA7" }));
    expect(res.shopName).toBe("Mehta Paints");
    expect(res.code).toBe("MEHTA7");
  });
});
