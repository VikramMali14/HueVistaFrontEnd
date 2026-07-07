import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { getCatalogueOrSample } from "@/lib/catalogue";
import { ColorFinder } from "@/components/catalogue/color-finder";
import { FabricPalette } from "@/components/catalogue/fabric-palette";
import { requireActiveSubscription } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Colour finder",
  description: "Upload a photograph and pull the nearest paint shade codes from any colour in it.",
};

export default async function ColorFinderPage() {
  // Subscriber-only tool: any ACTIVE subscription (trial or paid) may enter;
  // everyone else is redirected to pricing (or sign-in if unauthenticated).
  await requireActiveSubscription();
  // Live catalogue from the backend; falls back to the bundled sample if unreachable.
  const shades = await getCatalogueOrSample();
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Tool · Colour finder</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          From the photo. <i>To the can.</i>
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
          Upload any photograph, click a colour in it, and we match it to the nearest catalogue
          shade — code intact. Or take the palette we pull from the image automatically.
        </Lead>
      </header>
      <ColorFinder shades={shades} />
      <p className="finder-foot" style={{ marginTop: 20, font: "400 16px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
        Know the hex already?{" "}
        <Link href="/catalogue" style={{ color: "var(--accent)" }}>
          Match a colour by code on the catalogue →
        </Link>
      </p>

      <section style={{ marginTop: 72, paddingTop: 56, borderTop: "1px solid var(--rule)", paddingBottom: 0 }}>
        <FabricPalette shades={shades} />
      </section>
    </div>
  );
}
