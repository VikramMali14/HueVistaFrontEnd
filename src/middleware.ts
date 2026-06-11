import { NextRequest, NextResponse } from "next/server";

// NOTE: lives in src/ (not the project root) so Next actually runs it for a
// src/-based app. It gates protected routes AND refreshes the access token here,
// where cookies are writable — Server Components must not mutate cookies, so the
// refresh that used to happen during render (and crashed) now happens up here.

const PROTECTED_PREFIXES = ["/atelier", "/dashboard", "/portal", "/inbox", "/products", "/color-finder"];
// Pages that only make sense for a signed-OUT visitor. A signed-in user landing
// here (e.g. following an old "Begin a trial" link) is bounced home — they can't
// register or sign in again without signing out first. The Google OAuth callback
// at /sign-in/google is deliberately NOT listed: it runs mid-login, before the
// session cookies exist, and must be allowed through.
const GUEST_ONLY_PATHS = ["/sign-in", "/sign-in/forgot", "/trial"];
const ACCESS_COOKIE = "hv_access";
const SESSION_COOKIE = "hv_refresh";
const GUEST_COOKIE = "hv_guest";
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 days, matches the backend

const INTERNAL_ORIGIN = (
  process.env.API_INTERNAL_ORIGIN ??
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  "http://localhost:8080"
).replace(/\/$/, "");

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

  // Mock mode: sample/uploaded image bytes are public (the share page shows them
  // to anonymous visitors), so let them through without a session.
  if (process.env.MOCK_API === "1" && pathname.startsWith("/bff/api/images/files/mock/")) {
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

  // Mock mode (MOCK_API=1): tokens are static strings — "refresh" locally without
  // a backend. Kept inline (no ./lib/mock import) because middleware runs on the
  // edge runtime where the mock store's node:zlib dependency isn't available.
  if (process.env.MOCK_API === "1" && refresh.startsWith("mock-refresh-")) {
    const newAccess = refresh.replace("mock-refresh-", "mock-access-");
    req.cookies.set(ACCESS_COOKIE, newAccess);
    const res = NextResponse.next({ request: { headers: req.headers } });
    res.cookies.set(ACCESS_COOKIE, newAccess, cookieOpts(REFRESH_TTL));
    res.cookies.set(SESSION_COOKIE, refresh, cookieOpts(REFRESH_TTL));
    return res;
  }

  // Access expired but a refresh token is present → refresh it here. The backend
  // rotates refresh tokens, so we must persist the new pair (which is why this
  // can't live in a Server Component render).
  try {
    const upstream = await fetch(`${INTERNAL_ORIGIN}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: "no-store",
    });
    if (!upstream.ok) return denied();
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
    return denied();
  }
}

export const config = {
  matcher: [
    "/atelier/:path*",
    "/dashboard/:path*",
    "/portal/:path*",
    "/inbox/:path*",
    "/products/:path*",
    "/color-finder/:path*",
    "/bff/:path*",
    // Guest-only auth pages (exact — keep /sign-in/google out of the bounce).
    "/sign-in",
    "/sign-in/forgot",
    "/trial",
  ],
};
