import { NextResponse } from "next/server";
import { createSession } from "@/lib/handoff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desktop opens a hand-off session and gets back an id to encode in the QR code.
export async function POST() {
  const sessionId = createSession();
  return NextResponse.json(
    { sessionId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
