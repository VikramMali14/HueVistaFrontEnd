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
import { CatalogueToolbar } from "@/components/catalogue/catalogue-toolbar";
import { ColorMatch } from "@/components/catalogue/color-match";
import { Harmonies } from "@/components/catalogue/harmonies";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Every shade. Codes intact. Filter by family, finish, LRV.",
};

export default async function CataloguePage() {
  // Live catalogue from the backend; fall back to the bundled sample if it's unreachable.
  let shades: PaintShade[];
  try {
    const live = await fetchCatalogue();
    shades = live.length > 0 ? live : [...SHADES];
  } catch {
    shades = [...SHADES];
  }
  return (
    <>
      <Marquee items={["The Catalogue", "2,481 catalogued shades", "Asian Paints · codes intact · finishes preserved"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Colour library</Eyebrow>
            <Mono>2,481 shades · 4 partners</Mono>
          </div>
          <h1 className="display">Every shade.<br /><i>Codes intact.</i></h1>
          <Lead className="page-lead">Asian Paints at launch, with Berger and Nerolac soon to follow. Filter by family, finish, LRV, or regional style. Search by code, name, or hex.</Lead>
        </header>

        <section style={{ paddingTop: 80 }}>
          <ColorMatch />
          <p style={{ margin: "-32px 0 48px", font: "400 16px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
            Working from a photograph?{" "}
            <Link href="/color-finder" style={{ color: "var(--accent)" }}>
              Pull colours straight from an image →
            </Link>
          </p>
          <CatalogueToolbar shades={shades} />
        </section>

        <Harmonies />

        <section style={{ textAlign: "center", padding: "180px 0" }}>
          <div className="reveal">
            <h2 className="display" style={{ fontSize: "clamp(56px, 9vw, 142px)", lineHeight: 0.92 }}>
              Find the shade.<br /><i>Sell the same afternoon.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn btn-brass" href="/trial">Try it free <span className="arr">→</span></Link>
              <Link className="btn btn-ghost" href="/method">How it works <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
