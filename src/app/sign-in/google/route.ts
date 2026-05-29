/**
 * Kicks off the Google OAuth flow.
 *
 * We redirect the browser to the backend's well-known OAuth start endpoint
 * (`${apiOrigin}/api/auth/google`). The backend issues the upstream
 * redirect to Google, handles the callback, and is responsible for setting
 * the session cookies on the same eTLD before bouncing the user back to
 * `${appOrigin}/<next>` (or `/atelier` by default).
 *
 * We keep the `next` parameter for post-login routing and forward it as a
 * query string so the backend can echo it on the callback redirect.
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

  const url = new URL(`${config.apiOrigin}/api/auth/google`);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url.toString(), 302);
}
