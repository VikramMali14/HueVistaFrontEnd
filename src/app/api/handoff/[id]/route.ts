import { NextResponse } from "next/server";
import { isReady } from "@/lib/handoff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desktop polls this until status === "ready" (or 404 once the session expires).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = isReady(id);
  if (state === "missing") {
    return NextResponse.json({ status: "expired" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ status: state }, { headers: { "Cache-Control": "no-store" } });
}
