import { NextRequest, NextResponse } from "next/server";
import { clientIpFromHeaders } from "@/lib/client-ip";

// NOTE: lives in src/ (not the project root) so Next actually runs it for a
// src/-based app. It gates protected routes AND refreshes the access token here,
// where cookies are writable — Server Components must not mutate cookies, so the
// refresh that used to happen during render (and crashed) now happens up here.

// KEEP IN SYNC with `config.matcher` at the bottom of this file — Next.js
// requires the matcher to be a static literal, so the same route list exists
// twice. Adding a protected route means updating BOTH lists.
const PROTECTED_PREFIXES = ["/atelier", "/dashboard", "/portal", "/inbox", "/products", "/color-finder", "/account", "/admin", "/subscription"];
// Pages that only make sense for a signed-OUT visitor. A signed-in user landing
// here is bounced home — they can't register or sign in again without signing
// out first. The Google OAuth callback at /sign-in/google is deliberately NOT
// listed: it runs mid-login, before the session cookies exist, and must be
// allowed through. /trial is NOT listed either — it's the public shop lead form
// (no account is created there), so signed-in visitors may use it too.
const GUEST_ONLY_PATHS = ["/sign-in", "/sign-in/forgot", "/join"];
const ACCESS_COOKIE = "hv_access";
const SESSION_COOKIE = "hv_refresh";
const GUEST_COOKIE = "hv_guest";
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 days, matches the backend

const INTERNAL_ORIGIN = (
  process.env.API_INTERNAL_ORIGIN ??
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  "http://localhost:8080"
).replace(/\/$/, "");

// Offline demo mode: there is no backend to refresh against, so any present
// session is treated as valid (the demo login mints a 7-day access cookie, so
// this is only a belt-and-braces guard).
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public auth endpoints are REWRITTEN to the backend (next.config.ts), and
  // Next's rewrite proxy forwards X-Forwarded-For exactly as the client sent
  // it. Overwrite it with the trusted derivation before the rewrite runs, or a
  // forged header rotating fake IPs sidesteps the backend's per-IP limiters
  // (login, reset-code brute force…).
  if (pathname.startsWith("/api/auth/")) {
    const fwdHeaders = new Headers(req.headers);
    const ip = clientIpFromHeaders(req.headers);
    if (ip) fwdHeaders.set("x-forwarded-for", ip);
    else fwdHeaders.delete("x-forwarded-for");
    fwdHeaders.delete("x-real-ip"); // already folded into the derivation above
    return NextResponse.next({ request: { headers: fwdHeaders } });
  }

  const isBff = pathname.startsWith("/bff/");
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isGuestOnly = GUEST_ONLY_PATHS.includes(pathname);

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(SESSION_COOKIE)?.value;

  // Signed-in visitors have no business on sign-in / trial: send them home.
  if (isGuestOnly) {
    if (access || refresh) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!isBff && !isProtected) return NextResponse.next();

  // Anonymous guest creators (redeemed a shop code, no user session) authenticate
  // with the hv_guest token, which the BFF route validates itself — don't demand a
  // user session here or the guest endpoints can never be reached.
  if (pathname.startsWith("/bff/api/guest/") && req.cookies.get(GUEST_COOKIE)?.value) {
    return NextResponse.next();
  }

  // Browser still holds a (non-expired) access cookie → let it through.
  if (access) return NextResponse.next();

  const denied = () => {
    if (isBff) {
      // The caller is fetch(), not the user — fail fast with 401, don't redirect.
      const r = NextResponse.json({ message: "Not authenticated" }, { status: 401 });
      r.cookies.delete(ACCESS_COOKIE);
      r.cookies.delete(SESSION_COOKIE);
      return r;
    }
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname + search);
    const r = NextResponse.redirect(url);
    r.cookies.delete(ACCESS_COOKIE);
    r.cookies.delete(SESSION_COOKIE);
    return r;
  };

  // No session at all → bounce.
  if (!refresh) return denied();

  // Demo mode: no backend to refresh against — a refresh cookie alone is enough.
  if (DEMO_MODE) return NextResponse.next();

  // The backend couldn't be reached or answered 5xx — a restart/deploy in
  // progress, NOT an invalid session. Critically, the refresh cookie is KEPT:
  // deleting it here is what used to log everyone out on every server restart.
  // BFF callers get a 503 they can retry; page loads bounce to the (public,
  // backend-free) home page, and the still-present cookies mean the very next
  // visit to a protected page silently refreshes and restores the session.
  const unavailable = () => {
    if (isBff) {
      return NextResponse.json(
        { message: "The server is starting up — please try again in a moment." },
        { status: 503 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "?server=starting";
    return NextResponse.redirect(url);
  };

  // Access expired but a refresh token is present → refresh it here. The backend
  // rotates refresh tokens, so we must persist the new pair (which is why this
  // can't live in a Server Component render).
  try {
    // Forward the real client IP so the backend's per-IP refresh limiter buckets
    // per user, not under the single frontend-server IP.
    const fwd = clientIpFromHeaders(req.headers);
    const upstream = await fetch(`${INTERNAL_ORIGIN}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(fwd ? { "X-Forwarded-For": fwd } : {}),
      },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: "no-store",
    });
    if (!upstream.ok) {
      // Only a definitive auth verdict (401/403) means the session is dead and
      // the cookies should go. Anything else (5xx, 429, proxy errors) is the
      // backend having trouble — keep the session and fail soft.
      if (upstream.status === 401 || upstream.status === 403) return denied();
      return unavailable();
    }
    const auth = (await upstream.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    // Make the fresh tokens visible to THIS request's render/route handler…
    req.cookies.set(ACCESS_COOKIE, auth.accessToken);
    req.cookies.set(SESSION_COOKIE, auth.refreshToken);
    const res = NextResponse.next({ request: { headers: req.headers } });
    // …and persist them in the browser for subsequent requests.
    res.cookies.set(ACCESS_COOKIE, auth.accessToken, cookieOpts(Math.max(60, auth.expiresIn)));
    res.cookies.set(SESSION_COOKIE, auth.refreshToken, cookieOpts(REFRESH_TTL));
    return res;
  } catch {
    // Network failure (backend down / restarting) — keep the session cookies.
    return unavailable();
  }
}

export const config = {
  // KEEP IN SYNC with PROTECTED_PREFIXES / GUEST_ONLY_PATHS at the top — the
  // matcher must be a static literal, so it can't be built from those consts.
  matcher: [
    "/atelier/:path*",
    "/dashboard/:path*",
    "/portal/:path*",
    "/inbox/:path*",
    "/products/:path*",
    "/color-finder/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/subscription/:path*",
    "/bff/:path*",
    // Rewritten-to-backend auth endpoints — X-Forwarded-For normalisation only.
    "/api/auth/:path*",
    // Guest-only auth pages (exact — keep /sign-in/google out of the bounce).
    "/sign-in",
    "/sign-in/forgot",
    "/join",
  ],
};
