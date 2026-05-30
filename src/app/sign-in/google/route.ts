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

const SAFE_PATH = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("next") || "/atelier";
  // Only allow same-site relative paths; reject any attempt to point `next` at
  // an external URL, which would otherwise enable an open-redirect attack.
  const next = SAFE_PATH.test(requested) ? requested : "/atelier";

  const url = new URL(`${config.apiOrigin}/oauth2/authorization/google`);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url.toString(), 302);
}
