import type { NextConfig } from "next";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8080";
const isDev = process.env.NODE_ENV === "development";

const extraImageHosts = (process.env.IMAGE_REMOTE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Backend stores images in S3 and returns presigned URLs like
// `https://<bucket>.s3.<region>.amazonaws.com/...`. Allow any bucket in the
// configured region so the browser can fetch them. CSP only supports one
// wildcard label, so we key off the region (matches backend `app.s3.region`,
// default `ap-south-1`).
const s3Region = (process.env.S3_REGION ?? "ap-south-1").trim();
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
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=(), payment=(self \"https://checkout.razorpay.com\")",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const remotePatterns = [
  // Generic HTTPS image fallback for catalogue thumbs; tighten when we know the CDN host.
  { protocol: "https" as const, hostname: "**" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
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
    optimizePackageImports: ["zod"],
  },
};

export default nextConfig;
