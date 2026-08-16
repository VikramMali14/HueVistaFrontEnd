/**
 * Same-origin passthrough for S3-hosted media.
 *
 * `resolveMediaUrl` hands the browser a presigned S3 URL and the browser fetches it
 * directly — zero bytes through this server, which is the whole point of presigning.
 * That works for an ordinary `<img>`. It does NOT work for the images the studio and
 * the share page draw onto a canvas: those set `crossOrigin="anonymous"` so the canvas
 * stays readable, which makes the load a CORS request, and S3 answers it without an
 * `Access-Control-Allow-Origin` header unless the bucket has a CORS rule configured.
 * The browser then blocks the response and the room renders as a blank frame.
 *
 * So this route is the fallback: `loadCrossOriginImage` retries through it when a
 * direct cross-origin load fails, and the bytes arrive same-origin, where no CORS
 * header is required and no canvas is tainted. The backend also tries to install the
 * bucket rule at startup (see `S3BucketCorsInitializer`); when that succeeds the
 * direct load works and this route is never called.
 *
 * The caller does not get to choose what this server connects to. `@/lib/media-proxy`
 * pins the origin to one bucket named by configuration and rebuilds the rest of the
 * URL out of validated parts, so the string handed to `fetch` below is assembled
 * here rather than forwarded from the request. It needs `S3_BUCKET_NAME` set to arm;
 * without it the route stays off rather than widening what it will fetch.
 */

import { NextRequest, NextResponse } from "next/server";
import { MEDIA_ORIGIN, MEDIA_PROXY_TIMEOUT_MS, resolveProxyTarget } from "@/lib/media-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Warn once, not once per image, when the fallback is wanted but not configured. */
let warnedUnconfigured = false;

export async function GET(req: NextRequest) {
  if (!MEDIA_ORIGIN) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "/api/media was called but S3_BUCKET_NAME is not set, so the image CORS fallback " +
          "is off. Either set it (to the backend's bucket) or make sure the bucket's own " +
          "CORS rule allows this site — see docs in the API's IMAGE_UPLOAD_FLOW.md §12.",
      );
    }
    return NextResponse.json({ message: "Media proxy is not configured" }, { status: 503 });
  }

  const target = resolveProxyTarget(req.nextUrl.searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ message: "Unsupported media URL" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // A redirect could land anywhere; the allow-list only vouches for the URL we
      // were given, so follow none of them.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(MEDIA_PROXY_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ message: "Could not reach the image store" }, { status: 502 });
  }

  if (!upstream.ok) {
    // S3's own body is XML naming the bucket and key — don't forward it. The status
    // is the useful part: 403 means the signature expired, 404 means it's gone.
    return NextResponse.json({ message: "Image unavailable" }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ message: "Not an image" }, { status: 415 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    // `private` because the URL carries a signature: a shared cache must not hold
    // this for the next visitor. Short-lived so a repainted region redraws cheaply
    // without outliving the signature that fetched it.
    "Cache-Control": "private, max-age=300",
  });
  for (const h of ["content-length", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
