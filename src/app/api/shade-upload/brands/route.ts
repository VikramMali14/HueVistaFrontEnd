import { NextResponse } from "next/server";
import { config } from "@/lib/config";

/**
 * Public same-origin proxy to the backend's company list for the shade-upload
 * dropdown. No auth — the shade catalogue is public.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = await fetch(`${config.internalApiOrigin}/api/shade-upload/brands`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ message: "Could not load companies." }, { status: 502 });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ message: "Backend unreachable." }, { status: 502 });
  }
}
