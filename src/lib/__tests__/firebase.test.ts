import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The two pieces of `lib/firebase.ts` that are pure logic: whether the feature is on,
 * and how Firebase's developer-facing error codes are turned into something a customer
 * can act on.
 *
 * The module reads `process.env` at import time (that is how `NEXT_PUBLIC_*` inlining
 * works), so each case re-imports it with a fresh module registry.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

async function loadWith(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...env };
  return import("../firebase");
}

describe("phoneSignInEnabled", () => {
  it("is on when the api key, auth domain and project id are all present", async () => {
    const { phoneSignInEnabled } = await loadWith({
      NEXT_PUBLIC_FIREBASE_API_KEY: "AIza-test",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "huevista-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "huevista-test",
    });
    expect(phoneSignInEnabled).toBe(true);
  });

  it("does not need an app id — that one is only for Analytics", async () => {
    const { phoneSignInEnabled } = await loadWith({
      NEXT_PUBLIC_FIREBASE_API_KEY: "AIza-test",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "huevista-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "huevista-test",
      NEXT_PUBLIC_FIREBASE_APP_ID: undefined,
    });
    // Requiring it would turn a perfectly working setup into a hidden button.
    expect(phoneSignInEnabled).toBe(true);
  });

  it("is off when nothing is configured", async () => {
    const { phoneSignInEnabled } = await loadWith({
      NEXT_PUBLIC_FIREBASE_API_KEY: undefined,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: undefined,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined,
    });
    expect(phoneSignInEnabled).toBe(false);
  });

  it("treats a BLANK value as unset", async () => {
    // `ENV FOO=${FOO}` in a Dockerfile with no --build-arg sets an empty string, and a
    // `??` fallback accepts it happily. The same trap lib/config.ts documents for the
    // API origin; here it would mean offering a sign-in that cannot possibly work.
    const { phoneSignInEnabled } = await loadWith({
      NEXT_PUBLIC_FIREBASE_API_KEY: "   ",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "huevista-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "huevista-test",
    });
    expect(phoneSignInEnabled).toBe(false);
  });

  it("is off when the project id alone is missing", async () => {
    const { phoneSignInEnabled } = await loadWith({
      NEXT_PUBLIC_FIREBASE_API_KEY: "AIza-test",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "huevista-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined,
    });
    expect(phoneSignInEnabled).toBe(false);
  });
});

describe("phoneAuthErrorMessage", () => {
  it("names the actual problem for each code a customer can cause", async () => {
    const { phoneAuthErrorMessage } = await loadWith({});

    expect(phoneAuthErrorMessage({ code: "auth/invalid-phone-number" })).toMatch(/country code/);
    expect(phoneAuthErrorMessage({ code: "auth/invalid-verification-code" })).toMatch(/isn't right/);
    expect(phoneAuthErrorMessage({ code: "auth/code-expired" })).toMatch(/expired/);
    expect(phoneAuthErrorMessage({ code: "auth/too-many-requests" })).toMatch(/wait a few minutes/);
    expect(phoneAuthErrorMessage({ code: "auth/network-request-failed" })).toMatch(/connection/);
  });

  it("sends people to email — and logs — when the project is misconfigured", async () => {
    const { phoneAuthErrorMessage } = await loadWith({});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    // A missing authorised domain or a disabled provider is OUR mistake, not the
    // customer's. They get a way forward; the console gets the detail that explains it.
    expect(phoneAuthErrorMessage({ code: "auth/unauthorized-domain" })).toMatch(/use your email/);
    expect(phoneAuthErrorMessage({ code: "auth/operation-not-allowed" })).toMatch(/use your email/);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("falls back to something readable for anything it has never seen", async () => {
    const { phoneAuthErrorMessage } = await loadWith({});
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(phoneAuthErrorMessage({ code: "auth/some-future-code" })).toMatch(/try again/);
    expect(phoneAuthErrorMessage(new Error("boom"))).toMatch(/try again/);
    expect(phoneAuthErrorMessage(undefined)).toMatch(/try again/);
  });
});
