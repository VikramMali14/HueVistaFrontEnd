import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter, Space_Grotesk } from "next/font/google";
import { AppDownloadBanner } from "@/components/shared/app-download";
import { site } from "@/lib/config";
import "./globals.css";

// Self-hosted via next/font. The CSS variables feed globals.css:
// --serif (display headlines) is Space Grotesk, --sans (body) is Inter,
// --mono (codes, data labels) is JetBrains Mono.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.origin),
  title: {
    default: "HueVista — See any paint colour on your walls",
    template: "%s — HueVista",
  },
  description:
    "Upload a photo of a room and preview any paint colour on the walls in seconds. Built for paint shops and their customers.",
  applicationName: "HueVista",
  keywords: [
    "paint visualizer",
    "wall color preview",
    "paint shop software",
    "room color preview",
    "paint colors",
  ],
  authors: [{ name: "HueVista" }],
  openGraph: {
    title: "HueVista — See any paint colour on your walls",
    description:
      "Upload a photo of a room and preview any paint colour on the walls in seconds.",
    type: "website",
    locale: "en_IN",
    siteName: "HueVista",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "HueVista — shades & colours" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HueVista — See any paint colour on your walls",
    description: "Upload a photo of a room and preview any paint colour in seconds.",
    images: ["/brand/og.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a090f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

// Runs before first paint so the stored theme applies with no flash of the
// wrong one. Falls back to the OS preference, then dark. Kept as a string —
// it must not be bundled or deferred. suppressHydrationWarning on <html> is
// required because this mutates the attribute before React hydrates.
const THEME_INIT = `(function(){var t;try{t=localStorage.getItem("hv-theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        {/* Offers the Android APK on phone-width screens. Renders nothing when no
            build is published, on iOS, or inside the signed-in app. */}
        <AppDownloadBanner />
      </body>
    </html>
  );
}
