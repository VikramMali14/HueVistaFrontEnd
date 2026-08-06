import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { config } from "@/lib/config";

/**
 * CSV download for the payment audit.
 *
 * A route handler rather than a server action because the browser has to receive a FILE:
 * a server action can only return data to JavaScript, so the download would have to be
 * reassembled into a Blob in the client and the whole report held in memory to do it.
 * Streaming the backend's response straight through costs nothing and keeps the
 * `Content-Disposition` the backend already sets.
 *
 * The filters arrive as the same query string the report is using, and are passed on
 * unchanged — the backend ignores values it does not recognise, so a hand-edited URL
 * yields a broader export rather than an error.
 */
export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  // The page behind this link is already ADMIN-gated; this is the second lock, because a
  // route handler is reachable directly by URL. The backend checks the role itself, so an
  // authenticated non-admin gets a 403 from there rather than a file.
  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const params = new URLSearchParams(req.nextUrl.search);
  const upstream = `${config.internalApiOrigin}/api/admin/payment-audit/export?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      cache: "no-store",
    });
  } catch {
    // Never leak the internal origin into the browser.
    return NextResponse.json({ message: "Could not reach the reporting service." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { message: "Could not export the payment audit." },
      { status: res.status },
    );
  }

  const filename = `payment-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        res.headers.get("content-disposition") ?? `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
