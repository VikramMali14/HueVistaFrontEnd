import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

/**
 * Public same-origin proxy for submitting a JSON array of shades. Forwards the body
 * to the backend and passes its status + JSON straight back, so validation messages
 * (e.g. "Row 4: ...") reach the browser unchanged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${config.internalApiOrigin}/api/shade-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Backend unreachable." }, { status: 502 });
  }
}
