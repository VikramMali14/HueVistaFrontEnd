/**
 * Server-side BFF (back-end for front-end) proxy.
 *
 * The browser never sees the access token. Client code calls /bff/<backend-path>;
 * this route reads the HttpOnly access cookie, attaches the Authorization header,
 * and forwards to the Spring Boot backend. Refresh is handled transparently
 * via getAccessToken().
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = ["api/images", "api/projects", "api/auth/profile", "api/auth/me"] as const;

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED_PREFIXES.some((p) => joined === p || joined.startsWith(`${p}/`))) {
    return NextResponse.json({ message: "Forbidden path" }, { status: 403 });
  }

  const token = await getAccessToken();
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const search = req.nextUrl.search;
  const target = `${config.internalApiOrigin}/${joined}${search}`;

  const headers = new Headers();
  // Pass through only safe headers.
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", req.headers.get("accept") ?? "application/json");
  headers.set("Authorization", `Bearer ${token}`);

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
    return NextResponse.json(
      { message: "Upstream unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
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
