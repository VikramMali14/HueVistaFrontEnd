import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

/**
 * Public proxy to the backend's nearest-shade matcher. The colour-finder is a
 * public page (no auth), so it can't use the cookie-gated `/bff/*` client; this
 * same-origin route forwards the picked hex to `GET /api/shades/match`, which
 * scores the FULL seeded catalogue by CIELAB ΔE and returns the closest shades.
 * Falls through with a non-200 so the client can use its offline fallback.
 */
export async function GET(req: NextRequest) {
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
