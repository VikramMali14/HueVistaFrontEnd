"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, HttpError } from "./api";
import { config } from "./config";
import type { AuthResponse, AuthUser } from "./types";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

async function persistSession(auth: AuthResponse) {
  const jar = await cookies();
  jar.set(config.sessionCookie, auth.refreshToken, {
    ...cookieDefaults,
    maxAge: config.refreshTtlSeconds,
  });
  jar.set(config.accessCookie, auth.accessToken, {
    ...cookieDefaults,
    maxAge: Math.max(60, auth.expiresIn),
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(config.sessionCookie);
  jar.delete(config.accessCookie);
}

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) return access;
  const refresh = jar.get(config.sessionCookie)?.value;
  if (!refresh) return null;
  try {
    const auth = await api.refresh(refresh);
    await persistSession(auth);
    return auth.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect("/sign-in");
  return token;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await api.profile(token);
  } catch {
    return null;
  }
}

export async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/atelier");

  if (!email || !password) {
    return { error: "Please enter your email and passphrase." };
  }
  try {
    const auth = await api.login({ email, password });
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 401) return { error: "Incorrect email or passphrase." };
      return { error: err.message };
    }
    return { error: "Could not sign in. Please try again." };
  }
  redirect(next);
}

export async function registerAction(formData: FormData) {
  "use server";
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = [firstName, lastName].filter(Boolean).join(" ");

  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (password.length < 8) return { error: "Choose a passphrase of at least eight characters." };

  try {
    const auth = await api.register({ name, email, password });
    await persistSession(auth);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 409) return { error: "An account with that email already exists." };
      return { error: err.message };
    }
    return { error: "Could not create the account. Please try again." };
  }
  redirect("/atelier");
}

export async function logoutAction() {
  "use server";
  const jar = await cookies();
  const access = jar.get(config.accessCookie)?.value;
  if (access) {
    try { await api.logout(access); } catch { /* ignore */ }
  }
  await clearSession();
  redirect("/");
}
