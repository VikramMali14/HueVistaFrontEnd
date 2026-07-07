import type { Metadata } from "next";
import { sessionExists } from "@/lib/handoff-store";
import { MobileUpload } from "./mobile-upload";

export const metadata: Metadata = {
  title: "Send a photo · HueVista",
  description: "Upload a photo from your phone to the colour finder.",
  robots: { index: false, follow: false },
};

// The session check reads live in-memory state — never cache a render of it.
export const dynamic = "force-dynamic";

export default async function MobileHandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Check the hand-off session up front: with an expired/unknown QR the customer
  // should hear "expired" now, not after choosing and uploading their photo.
  if (!sessionExists(id)) return <ExpiredNotice />;
  return <MobileUpload sessionId={id} />;
}

function ExpiredNotice() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        background: "var(--bg)",
        color: "var(--fg)",
        textAlign: "center",
      }}
    >
      <span style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".32em", textTransform: "uppercase", color: "var(--accent)" }}>
        HueVista · send a photo
      </span>
      <h1 style={{ font: "400 30px/1.15 var(--serif)", margin: 0, maxWidth: "16ch" }}>
        This code has expired.
      </h1>
      <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "34ch", margin: 0 }}>
        Codes last 10 minutes. Refresh the page on your computer to get a fresh
        QR code, then scan it again.
      </p>
    </main>
  );
}
