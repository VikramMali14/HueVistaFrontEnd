import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  themeColor: "#15110d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Hanken+Grotesk:wght@300;400;500;600&family=IBM+Plex+Mono:wght@300;400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
