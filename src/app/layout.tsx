import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font. The CSS variables feed globals.css:
// --serif (display headlines) is Inter Tight, --sans (body) is Inter,
// --mono (codes, data labels) is IBM Plex Mono.
const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://huevista.com"),
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
  },
  twitter: {
    card: "summary_large_image",
    title: "HueVista — See any paint colour on your walls",
    description: "Upload a photo of a room and preview any paint colour in seconds.",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
