/**
 * Demo accounts + the fake "access token" used in DEMO_MODE.
 *
 * There is no real JWT to sign/verify offline, so the demo access token simply
 * encodes the signed-in identity: `hvdemo.<ROLE>.<userId>`. Both backend
 * boundaries (serverFetch + the BFF route) decode it to answer role-aware
 * fixtures — e.g. an ADMIN sees Inbox/Admin, a RETAILER sees Portal/Products,
 * a CUSTOMER sees neither. The token never reaches the browser (it lives only in
 * the HttpOnly `hv_access` cookie), exactly like the real token.
 */
import type { AuthResponse, AuthUser, UserProfile } from "../types";

/** Single shared password for every demo account. */
export const DEMO_PASSWORD = "huevista";

/** 7 days — keeps the `hv_access` cookie alive for the whole demo so the
 *  middleware never needs to refresh against a (non-existent) backend. */
export const DEMO_EXPIRES_IN = 60 * 60 * 24 * 7;

export type DemoRole = "RETAILER" | "ADMIN" | "CUSTOMER";

export interface DemoAccount extends UserProfile {
  role: DemoRole;
}

export const DEMO_USERS: Record<DemoRole, DemoAccount> = {
  RETAILER: {
    id: "usr_mehta",
    name: "Rajesh Mehta",
    email: "rajesh@mehtapaints.in",
    picture: null,
    provider: "LOCAL",
    role: "RETAILER",
    emailVerified: true,
    phoneNumber: "+91 98860 12345",
    phoneVerified: true,
    createdAt: "2025-11-02T09:30:00+05:30",
    updatedAt: "2026-06-20T10:00:00+05:30",
  },
  ADMIN: {
    id: "usr_asha",
    name: "Asha Menon",
    email: "admin@huevista.in",
    picture: null,
    provider: "LOCAL",
    role: "ADMIN",
    emailVerified: true,
    phoneNumber: "+91 99000 11223",
    phoneVerified: true,
    createdAt: "2025-09-01T08:00:00+05:30",
    updatedAt: "2026-06-21T08:00:00+05:30",
  },
  CUSTOMER: {
    // A walk-in customer who redeemed a shop code. Email left unverified so the
    // dashboard's "Secure your account" OTP card is demoable on this account.
    // (The card is email-only while SMS verification is hidden.)
    id: "usr_anjali",
    name: "Anjali Nair",
    email: "anjali@example.in",
    picture: null,
    provider: "LOCAL",
    role: "CUSTOMER",
    emailVerified: false,
    phoneNumber: "+91 98470 55667",
    phoneVerified: false,
    createdAt: "2026-06-01T07:30:00+05:30",
    updatedAt: "2026-06-22T07:30:00+05:30",
  },
};

/** email (lowercased) -> role. Used by the demo login. */
const EMAIL_TO_ROLE: Record<string, DemoRole> = {
  "rajesh@mehtapaints.in": "RETAILER",
  "admin@huevista.in": "ADMIN",
  "anjali@example.in": "CUSTOMER",
};

/** Public listing for the sign-in banner. */
export const DEMO_ACCOUNT_LIST = (Object.keys(DEMO_USERS) as DemoRole[]).map((role) => ({
  role,
  email: DEMO_USERS[role].email,
  name: DEMO_USERS[role].name,
}));

const TOKEN_PREFIX = "hvdemo";

export function encodeDemoToken(role: DemoRole, id: string): string {
  return `${TOKEN_PREFIX}.${role}.${id}`;
}

/** Decode a demo access/refresh token back to its identity, or null if it isn't one. */
export function decodeDemoToken(token: string | null | undefined): DemoAccount | null {
  if (!token || !token.startsWith(`${TOKEN_PREFIX}.`)) return null;
  const role = token.split(".")[1] as DemoRole | undefined;
  if (role && DEMO_USERS[role]) return DEMO_USERS[role];
  return null;
}

/** Resolve the demo user for a request, defaulting to the RETAILER (richest demo). */
export function demoUserFromToken(token: string | null | undefined): DemoAccount {
  return decodeDemoToken(token) ?? DEMO_USERS.RETAILER;
}

/** Build the AuthResponse the login/register/refresh server actions persist. */
export function authResponseFor(role: DemoRole): AuthResponse {
  const user = DEMO_USERS[role];
  return {
    accessToken: encodeDemoToken(role, user.id),
    refreshToken: encodeDemoToken(role, user.id),
    tokenType: "Bearer",
    expiresIn: DEMO_EXPIRES_IN,
    user: user as AuthUser,
  };
}

/**
 * Validate demo credentials. The shared DEMO_PASSWORD is the single key; the
 * email selects the role. An unknown email with the right password still logs in
 * as a RETAILER so a demo visitor is never locked out — but a wrong password is
 * rejected (so the "incorrect password" path is still demoable).
 */
export function authenticateDemo(email: string, password: string): AuthResponse | null {
  if (password !== DEMO_PASSWORD) return null;
  const role = EMAIL_TO_ROLE[email.trim().toLowerCase()] ?? "RETAILER";
  return authResponseFor(role);
}
