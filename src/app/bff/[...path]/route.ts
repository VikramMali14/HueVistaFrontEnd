/**
 * Server-side BFF (back-end for front-end) proxy.
 *
 * The browser never sees the access token. Client code calls /bff/<backend-path>;
 * this route reads the HttpOnly access cookie, attaches the Authorization header,
 * and forwards to the Spring Boot backend. Refresh is handled transparently
 * via getAccessToken().
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { config } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = [
  "api/images",
  "api/projects",
  // Anonymous guest creator (upload + create one project + recolour), scoped by
  // the redeemed access code. Authed with the hv_guest token, not the user token.
  "api/guest",
  "api/auth/profile",
  "api/auth/me",
  // Email/mobile verification (send + confirm OTP). NOT "api/auth" — that would
  // also expose login/register/refresh/logout through the BFF.
  "api/auth/verify",
  // Change password from the account page (requires the current password; the
  // backend revokes every session on success).
  "api/auth/change-password",
  "api/me/entitlement",
  // The shop's suggested combinations for whoever is visualising (studio AI tab).
  "api/me/retailer-combos",
  // The shop's shade-code scheme — the studio encodes displayed codes with it.
  "api/me/shade-code-scheme",
  "api/billing/project-credit",
  "api/billing/subscriptions",
  "api/billing/plans",
  // Pay-per-use billing the signed-in retailer drives from the plan page: the
  // prepaid wallet (balance, top-up, pay-from-wallet), one-off extra-image
  // purchases, and the colour-board PDF allowance/downloads. Without these the
  // BFF answers 403 before the request ever reaches the backend.
  "api/billing/wallet",
  "api/billing/image-credits",
  "api/billing/pdf-allowance",
  "api/billing/pdf-downloads",
  "api/organizations",
  "api/access-codes",
  // Retailer kiosk-link updates (create/list live under api/organizations).
  "api/store-links",
  "api/support",
  "api/paint",
  // Public read-only brand/shade catalogue — the portal's "restrict code to
  // brands" picker loads the live brand list through here.
  "api/shades",
] as const;

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED_PREFIXES.some((p) => joined === p || joined.startsWith(`${p}/`))) {
    return NextResponse.json({ message: "Forbidden path" }, { status: 403 });
  }

  // Guest endpoints authenticate with the guest token; everything else with the
  // user token. This keeps a signed-in user and a guest session cleanly separate.
  // One deliberate fallback: a guest with NO user session still needs non-guest
  // GETs like /api/images/files/** (their own photo, when the backend stores
  // files locally instead of S3) — the backend authorises the guest principal
  // against the file's access-code prefix, so handing it the guest token is safe.
  const isGuestPath = joined === "api/guest" || joined.startsWith("api/guest/");
  const jar = await cookies();
  const token = isGuestPath
    ? (jar.get(config.guestCookie)?.value ?? null)
    : ((await getAccessToken()) ?? jar.get(config.guestCookie)?.value ?? null);
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  // DEMO_MODE: no backend — answer from in-memory fixtures. Sits AFTER the
  // allow-list + auth checks so 403/401 semantics still hold, and INSTEAD of the
  // upstream fetch below.
  if (isDemoMode()) {
    const { demoBff } = await import("@/lib/demo/bff");
    return demoBff(req, joined, token);
  }

  const search = req.nextUrl.search;
  const target = `${config.internalApiOrigin}/${joined}${search}`;

  const headers = new Headers();
  // Pass through only safe headers.
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", req.headers.get("accept") ?? "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  // The backend's per-IP limiters (OTP send/confirm, code redeem, uploads)
  // should bucket by the real visitor, not this server's single IP.
  const clientIp = clientIpFromHeaders(req.headers);
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    // Log internally; don't leak the internal origin/host to the browser.
    console.error("BFF upstream fetch failed:", err);
    return NextResponse.json({ message: "Upstream unreachable" }, { status: 502 });
  }

  const resHeaders = new Headers();
  const passthroughHeaders = ["content-type", "content-length", "cache-control", "etag"];
  for (const h of passthroughHeaders) {
    const v = upstream.headers.get(h);
    if (v) resHeaders.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
