import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * Session-gated proxy to the backend's nearest-shade matcher. The colour-finder
 * is now a subscriber-only tool, so this same-origin route requires a signed-in
 * session before forwarding the picked hex to `GET /api/shades/match` (which
 * scores the FULL seeded catalogue by CIELAB ΔE). Unauthenticated callers get a
 * 401; the client treats any non-200 as "use the bundled offline matcher".
 */
export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }
  const hex = req.nextUrl.searchParams.get("hex");
  const brand = req.nextUrl.searchParams.get("brand");
  const limit = req.nextUrl.searchParams.get("limit") ?? "8";
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    return NextResponse.json({ message: "hex must be a 6-digit colour" }, { status: 400 });
  }
  const qs = new URLSearchParams({ hex, limit });
  if (brand) qs.set("brand", brand);
  try {
    const upstream = await fetch(`${config.internalApiOrigin}/api/shades/match?${qs}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ message: "match unavailable" }, { status: 502 });
    }
    const data = await upstream.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ message: "backend unreachable" }, { status: 502 });
  }
}
