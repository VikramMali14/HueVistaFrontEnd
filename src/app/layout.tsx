import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Inter_Tight } from "next/font/google";
import { getUiTheme } from "@/lib/auth";
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
    default: "HueVista — See any paint color on your walls",
    template: "%s — HueVista",
  },
  description:
    "Upload a photo of a room and preview any paint color on the walls in seconds. Built for paint shops, painters, and homeowners.",
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
    title: "HueVista — See any paint color on your walls",
    description:
      "Upload a photo of a room and preview any paint color on the walls in seconds.",
    type: "website",
    locale: "en_IN",
    siteName: "HueVista",
  },
  twitter: {
    card: "summary_large_image",
    title: "HueVista — See any paint color on your walls",
    description: "Upload a photo of a room and preview any paint color in seconds.",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0d" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getUiTheme();
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
