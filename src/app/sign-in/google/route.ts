/**
 * Kicks off the Google OAuth flow.
 *
 * Redirects the browser to Spring Security's OAuth2 entry point
 * (`${apiOrigin}/oauth2/authorization/google`). After Google authenticates the user,
 * the backend success handler redirects back to `/sign-in/callback` with the tokens
 * in the URL fragment, where the session is persisted.
 *
 * The backend round-trip can't carry our `next` param, so we stash the post-login
 * destination in a short-lived `hv_oauth_next` cookie and read it back in the callback.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

const SAFE_PATH = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("next") || "/dashboard";
  // Only allow same-site relative paths; reject any attempt to point `next` at an
  // external URL, which would otherwise enable an open-redirect attack.
  const next = SAFE_PATH.test(requested) ? requested : "/dashboard";

  const url = new URL(`${config.apiOrigin}/oauth2/authorization/google`);
  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set("hv_oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
