import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getUiTheme, getUiVariant } from "@/lib/auth";
import "./globals.css";

// Self-hosted via next/font — replaces the render-blocking Google Fonts <link>
// and removes the no-page-custom-font warning. Each exposes a CSS variable that
// globals.css feeds into --serif / --sans / --mono.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://huevista.com"),
  title: {
    default: "HueVista — See the wall before the paint",
    template: "%s — HueVista",
  },
  description:
    "AI-powered paint shade visualiser for the Indian paint retail trade. From a customer's photograph to a photorealistic preview — under twenty seconds.",
  applicationName: "HueVista",
  keywords: [
    "paint visualiser",
    "Asian Paints",
    "Berger",
    "Nerolac",
    "Indian paint retail",
    "wall colour preview",
    "B2B paint software",
  ],
  authors: [{ name: "HueVista Atelier" }],
  openGraph: {
    title: "HueVista — See the wall before the paint",
    description:
      "An AI-powered paint shade visualiser engineered in Belgavi for the Indian paint retail trade.",
    type: "website",
    locale: "en_IN",
    siteName: "HueVista",
  },
  twitter: {
    card: "summary_large_image",
    title: "HueVista — See the wall before the paint",
    description: "AI-powered paint shade visualiser for retailers.",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#15110d" },
    { media: "(prefers-color-scheme: light)", color: "#f5efe1" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "dark light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [variant, theme] = await Promise.all([getUiVariant(), getUiTheme()]);
  return (
    <html
      lang="en"
      data-variant={variant}
      data-theme={theme}
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
