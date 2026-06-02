import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { SHADES } from "@/lib/shades";
import { fetchCatalogue } from "@/lib/catalogue";
import type { PaintShade } from "@/lib/types";
import { ColorFinder } from "@/components/catalogue/color-finder";

export const metadata: Metadata = {
  title: "Colour finder",
  description: "Upload a photograph and pull the nearest paint shade codes from any colour in it.",
};

export default async function ColorFinderPage() {
  // Live catalogue from the backend; fall back to the bundled sample if unreachable.
  let shades: PaintShade[];
  try {
    const live = await fetchCatalogue();
    shades = live.length > 0 ? live : [...SHADES];
  } catch {
    shades = [...SHADES];
  }
  return (
    <>
      <Marquee items={["Colour finder", "Photo → shade code", "Asian Paints · codes intact", "Sample any pixel · match by ΔE"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Tool &nbsp;·&nbsp; Colour finder</Eyebrow>
            <Mono>image → shade code</Mono>
          </div>
          <h1 className="display">From the photo.<br /><i>To the can.</i></h1>
          <Lead className="page-lead">
            Upload any photograph, click a colour in it, and we match it to the nearest catalogue shade —
            code intact. Or take the palette we pull from the image automatically.
          </Lead>
        </header>

        <section style={{ paddingTop: 56, paddingBottom: 120 }}>
          <ColorFinder shades={shades} />
          <p className="finder-foot" style={{ marginTop: 20, font: "300 italic 16px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
            Know the hex already?{" "}
            <Link href="/catalogue" style={{ color: "var(--accent)" }}>
              Match a colour by code on the catalogue →
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
