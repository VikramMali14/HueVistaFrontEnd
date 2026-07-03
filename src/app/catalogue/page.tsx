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
import { CompetitorTranslator } from "@/components/catalogue/competitor-translator";
import { WhitesFinder } from "@/components/catalogue/whites-finder";
import { Harmonies } from "@/components/catalogue/harmonies";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Thousands of paint shades with real codes across every company we carry. Search by name, code or hex; filter by colour family and finish.",
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
  const brands = Array.from(new Set(shades.map((s) => s.brand))).sort((a, b) => a.localeCompare(b));
  const brandLine = brands.length === 1 ? brands[0]! : `${brands.length} companies`;
  return (
    <>
      <Marquee items={["The Catalogue", "Every code intact · finishes preserved", `${brandLine} · more to follow`]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Colour library</Eyebrow>
            <Mono>{shades.length.toLocaleString("en-IN")} shades · {brandLine} · more to follow</Mono>
          </div>
          <h1 className="display">Every shade.<br /><i>Codes intact.</i></h1>
          <Lead className="page-lead">{brands.join(", ")} — with more companies to follow. Filter by colour family, finish, or light value (LRV). Search by code, name, or hex.</Lead>
        </header>

        <section style={{ paddingTop: 80 }}>
          <ColorMatch />
          <CompetitorTranslator shades={shades} />
          <CatalogueToolbar shades={shades} />
        </section>

        <section id="whites">
          <header style={{ marginBottom: 40 }}>
            <div className="eyebrow-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
              <Eyebrow>Whites finder</Eyebrow>
              <Mono>sorted by hidden tint</Mono>
            </div>
            <h2 className="display" style={{ fontSize: "clamp(36px, 5vw, 72px)", marginTop: 24 }}>
              Hundreds of whites.<br /><i>Not one alike.</i>
            </h2>
            <Lead style={{ marginTop: 24 }}>
              Every white hides a tint — warm, pinkish, greenish or cool — and on a phone they all
              look the same. We sort them by that tint; pick two and compare them across the full screen.
            </Lead>
          </header>
          <WhitesFinder shades={shades} />
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
