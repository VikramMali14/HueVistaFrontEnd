import { NextRequest, NextResponse } from "next/server";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { createSession } from "@/lib/handoff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-IP throttle: the store has a global session cap, so without this a single
// client flooding POSTs could fill the cap and evict everyone else's pending
// hand-offs. Fixed window, in-process (same scope as the store itself).
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const g = globalThis as unknown as { __hvHandoffRate?: Map<string, { count: number; windowStart: number }> };
const hits = g.__hvHandoffRate ?? (g.__hvHandoffRate = new Map());

function allow(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (now - v.windowStart > WINDOW_MS) hits.delete(k);
    }
  }
  const e = hits.get(ip);
  if (!e || now - e.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  e.count += 1;
  return e.count <= MAX_PER_WINDOW;
}

// Desktop opens a hand-off session and gets back an id to encode in the QR code.
export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers) || "unknown";
  if (!allow(ip)) {
    return NextResponse.json(
      { error: "Too many hand-off sessions. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
  }
  const sessionId = createSession();
  return NextResponse.json(
    { sessionId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
