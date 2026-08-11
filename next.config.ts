import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Must match `src/lib/config.ts`. This file is loaded by Node at SERVER START, while
// NEXT_PUBLIC_* is inlined into the app at BUILD time — so when the variable is set in
// one and not the other, the CSP written here and the URLs the app actually requests
// disagree, and the browser blocks images that were never going to be malicious. A
// production default that names a real host keeps them agreeing when neither is set.
// Blank counts as unset: `ENV FOO=${FOO}` with no --build-arg yields an empty string,
// and a `??` fallback would happily accept it and emit a CSP with no API host at all.
//
// `next build` also bakes headers() into the routes manifest, which is the other half
// of the same trap: the policy a container serves is the one its IMAGE was built with,
// so the Dockerfile carries these through as build args too.
const apiOrigin = (
  process.env.NEXT_PUBLIC_API_ORIGIN?.trim() ||
  (isDev ? "http://localhost:8080" : "https://api.huevista.org")
).replace(/\/$/, "");

const extraImageHosts = (process.env.IMAGE_REMOTE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Backend stores images in S3 and returns presigned URLs like
// `https://<bucket>.s3.<region>.amazonaws.com/...`. Allow any bucket in the
// configured region so the browser can fetch them. CSP only supports one
// wildcard label, so we key off the region (matches backend `app.s3.region`,
// default `ap-south-1`).
const s3Region = (process.env.S3_REGION || "ap-south-1").trim();
const s3ImageHost = `https://*.s3.${s3Region}.amazonaws.com`;

// CSP — keep tight in prod, loosen for dev tooling (HMR websocket, eval).
// connect-src for the browser only ever talks to the same origin via /bff/*,
// so the public API origin is *not* listed in prod connect-src.
// Razorpay Checkout loads its script and opens an iframe to these hosts.
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_FRAME = "https://api.razorpay.com https://checkout.razorpay.com";
const RAZORPAY_CONNECT = "https://*.razorpay.com https://lumberjack.razorpay.com";

const scriptSrc = isDev
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${RAZORPAY_SCRIPT}`
  : `script-src 'self' 'unsafe-inline' ${RAZORPAY_SCRIPT}`;

const connectSrc = isDev
  ? `connect-src 'self' ${apiOrigin} ${RAZORPAY_CONNECT} ws: wss:`
  : `connect-src 'self' ${RAZORPAY_CONNECT}`;

// img-src: same-origin + data/blob for uploads + backend host for served images.
const apiHost = (() => {
  try {
    return new URL(apiOrigin).origin;
  } catch {
    return apiOrigin;
  }
})();
const imgSrc =
  `img-src 'self' data: blob: ${apiHost} ${s3ImageHost} ${extraImageHosts.join(" ")}`.trim();

const cspDirectives = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  imgSrc,
  connectSrc,
  "frame-ancestors 'none'",
  `frame-src ${RAZORPAY_FRAME}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // No `interest-cohort=()`. That opt-out was for FLoC, which Chrome shipped as
    // an origin trial in 2021, abandoned, and replaced with the Topics API; the
    // feature name no longer exists in any browser. What is left of it is a
    // console error on every single page load —
    //   Error with Permissions-Policy header: Unrecognized feature: 'interest-cohort'.
    // — because an unknown feature name invalidates that entry. It bought nothing
    // (there is no FLoC to opt out of) and cost a permanent error in every
    // visitor's console, which is where real errors are supposed to stand out.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

// Restrict the Next.js image optimizer to the SAME hosts the CSP img-src allows.
// A blanket { hostname: "**" } turns /_next/image into an open proxy: the server
// will fetch (and cache) an image from ANY https host an attacker names — an SSRF /
// bandwidth-abuse vector. Mirror the CSP-allowed set instead (S3 region bucket,
// the backend origin, and any explicitly configured IMAGE_REMOTE_HOSTS).
type RemotePattern = { protocol: "http" | "https"; hostname: string };

function toRemotePattern(host: string): RemotePattern | null {
  const h = host.trim();
  if (!h) return null;
  if (h.includes("://")) {
    try {
      const u = new URL(h);
      return { protocol: u.protocol === "http:" ? "http" : "https", hostname: u.hostname };
    } catch {
      return null;
    }
  }
  return { protocol: "https", hostname: h };
}

const remotePatterns: RemotePattern[] = [
  { protocol: "https", hostname: `*.s3.${s3Region}.amazonaws.com` },
  toRemotePattern(apiOrigin),
  ...extraImageHosts.map(toRemotePattern),
].filter((p): p is RemotePattern => p !== null);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  // The default incremental cache rejects fetch responses over 2MB, which the
  // shade catalogue exceeds; any custom handler is exempt from that limit.
  cacheHandler: path.join(process.cwd(), "cache-handler.js"),
  cacheMaxMemorySize: 0, // disable the default in-memory LRU; the handler stores everything
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // One noun per concept, in the URL too. The nav said "Studio", "Plan" and
  // "Colour finder" while the addresses read /atelier, /subscription and
  // /color-finder — American spelling at that, on a site that writes
  // /catalogue everywhere else. Permanent redirects so every link already in
  // the wild, every bookmark and every QR code printed for a counter still
  // lands in the right place.
  async redirects() {
    return [
      { source: "/atelier", destination: "/studio", permanent: true },
      { source: "/atelier/:path*", destination: "/studio/:path*", permanent: true },
      { source: "/subscription", destination: "/plan", permanent: true },
      { source: "/subscription/:path*", destination: "/plan/:path*", permanent: true },
      { source: "/color-finder", destination: "/colour-finder", permanent: true },
      { source: "/color-finder/:path*", destination: "/colour-finder/:path*", permanent: true },
      // "Redeem" was the wrong verb: it describes trading a voucher in once, while
      // the code actually opens a window of access that the shop sets in days and
      // can extend or top up. The page is /unlock now.
      //
      // This redirect is not optional housekeeping. The old address was PRINTED —
      // it is the instruction on the "Paid. You're in." screen after a kiosk
      // payment, and it has gone out on counter cards and QR codes that cannot be
      // recalled. Every one of those has to keep landing somewhere real.
      { source: "/redeem", destination: "/unlock", permanent: true },
      { source: "/redeem/:path*", destination: "/unlock/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Apply security headers globally.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Defence-in-depth: never cache anything that could carry auth.
        source: "/bff/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
  async rewrites() {
    // Forward unauthenticated public auth endpoints (forgot-password, google start,
    // etc.) to the backend. Authenticated endpoints go through /bff/* instead so
    // the access token is attached server-side.
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiOrigin}/api/auth/:path*`,
      },
      {
        // Public paint catalogue + nearest-colour match. No auth, so it's a plain
        // same-origin proxy (keeps the browser's connect-src 'self' happy).
        source: "/api/shades/:path*",
        destination: `${apiOrigin}/api/shades/:path*`,
      },
    ];
  },
  experimental: {
    // BFF route streams multipart uploads; allow generous body size.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
