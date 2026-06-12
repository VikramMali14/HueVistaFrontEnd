/**
 * Mock backend mode — test the ENTIRE frontend with no Spring Boot backend.
 *
 * Enable with `MOCK_API=1` (or `npm run dev:mock`). Every server-side touchpoint
 * that would normally reach the backend (the /bff proxy, the auth server actions,
 * the middleware token refresh, the public share page) branches into the in-memory
 * mock implementation instead, so sign-in, the dashboard, the studio (upload →
 * segment → recolour → save → share), the portal, products, support and the admin
 * inbox all work end-to-end against static data.
 *
 * Static test credentials (password for all: `huevista123`):
 *   retailer@huevista.test — RETAILER: dashboard, studio, portal, products, codes
 *   customer@huevista.test — CUSTOMER: entitlement-gated project flow
 *   admin@huevista.test    — ADMIN: support inbox + everything retail
 *
 * Other static values: OTP for email/phone verification is `123456`; the guest
 * shop access code on /redeem is `PAINTSHOP1`.
 *
 * Nothing here persists — state lives in module memory and resets on server
 * restart. Razorpay checkout and Google OAuth still need real services; Google
 * sign-in is short-circuited to the retailer account in mock mode.
 */

import type { AuthResponse, AuthUser } from "../types";

export const MOCK_PASSWORD = "huevista123";
export const MOCK_OTP = "123456";
export const MOCK_GUEST_CODE = "PAINTSHOP1";
export const MOCK_GUEST_TOKEN = "mock-guest-token";

/** 7 days — matches the refresh TTL so the access cookie never needs a refresh. */
export const MOCK_EXPIRES_IN = 60 * 60 * 24 * 7;

export function mockEnabled(): boolean {
  // trim: Windows `set MOCK_API=1 && …` puts the space before `&&` into the value.
  return process.env.MOCK_API?.trim() === "1";
}

export interface MockUserSeed extends AuthUser {
  password: string;
}

export const MOCK_USERS: ReadonlyArray<MockUserSeed> = [
  {
    id: "mock-retailer",
    name: "Priya Mehta",
    email: "retailer@huevista.test",
    provider: "LOCAL",
    role: "RETAILER",
    emailVerified: true,
    phoneNumber: "+91 98200 11223",
    phoneVerified: false,
    password: MOCK_PASSWORD,
  },
  {
    id: "mock-customer",
    name: "Arjun Rao",
    email: "customer@huevista.test",
    provider: "LOCAL",
    role: "CUSTOMER",
    emailVerified: false,
    phoneNumber: null,
    phoneVerified: false,
    password: MOCK_PASSWORD,
  },
  {
    id: "mock-admin",
    name: "Sana Kapoor",
    email: "admin@huevista.test",
    provider: "LOCAL",
    role: "ADMIN",
    emailVerified: true,
    phoneNumber: "+91 99300 44556",
    phoneVerified: true,
    password: MOCK_PASSWORD,
  },
];

const ACCESS_PREFIX = "mock-access-";
const REFRESH_PREFIX = "mock-refresh-";

export function mockAccessToken(userId: string): string {
  return `${ACCESS_PREFIX}${userId}`;
}

export function mockRefreshToken(userId: string): string {
  return `${REFRESH_PREFIX}${userId}`;
}

export function userIdFromMockToken(token: string): string | null {
  if (token.startsWith(ACCESS_PREFIX)) return token.slice(ACCESS_PREFIX.length);
  if (token.startsWith(REFRESH_PREFIX)) return token.slice(REFRESH_PREFIX.length);
  return null;
}

export function mockAuthResponse(user: AuthUser): AuthResponse {
  return {
    accessToken: mockAccessToken(user.id),
    refreshToken: mockRefreshToken(user.id),
    tokenType: "Bearer",
    expiresIn: MOCK_EXPIRES_IN,
    user,
  };
}
