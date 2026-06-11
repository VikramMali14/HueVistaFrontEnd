/**
 * Kicks off the Google OAuth flow.
 *
 * We redirect the browser to Spring Security's OAuth2 entry point
 * (`${apiOrigin}/oauth2/authorization/google`) — that is the real start URL the backend
 * exposes (there is no `/api/auth/google` endpoint).
 *
 * IMPORTANT — known gap (see audit report): the backend's OAuth2 success handler currently
 * writes the JWT as a JSON *response body* rather than redirecting back to the frontend with
 * the tokens. So this first hop is correct, but end-to-end Google sign-in will only complete
 * once the backend success handler redirects to a frontend callback (e.g.
 * `${appOrigin}/sign-in/callback#accessToken=...&refreshToken=...`) that persists the session.
 * Email/password sign-in is the fully working path today.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { MOCK_EXPIRES_IN, mockAccessToken, mockEnabled, mockRefreshToken } from "@/lib/mock";

const SAFE_PATH = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("next") || "/atelier";
  // Only allow same-site relative paths; reject any attempt to point `next` at
  // an external URL, which would otherwise enable an open-redirect attack.
  // The charset alone would still admit "//evil.com" (browsers treat "//" and
  // "/\" as protocol-relative), so reject those shapes explicitly — same rule
  // as safeNext() in lib/auth.ts.
  const next =
    SAFE_PATH.test(requested) && !requested.startsWith("//") && !requested.startsWith("/\\")
      ? requested
      : "/atelier";

  // Mock mode: there is no OAuth backend — sign straight in as the test retailer
  // so the Google button stays clickable while testing.
  if (mockEnabled()) {
    const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), 302);
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: MOCK_EXPIRES_IN,
    };
    res.cookies.set(config.accessCookie, mockAccessToken("mock-retailer"), opts);
    res.cookies.set(config.sessionCookie, mockRefreshToken("mock-retailer"), opts);
    return res;
  }

  const url = new URL(`${config.apiOrigin}/oauth2/authorization/google`);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url.toString(), 302);
}
