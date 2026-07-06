import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";
import { GalleryGrid, type Plate, type PlateCategory } from "@/components/gallery/gallery-grid";
import { WORKS } from "@/lib/work";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A library of finished rooms — twelve plates recoloured with real catalogue shades. Only the wall changes.",
};

// Gallery-local presentation only: editorial title styling, grid category, month.
// Codes, swatches, locations and years come from the WORKS source of truth.
const PLATE_META: Record<string, { category: PlateCategory; month: string; title: ReactNode }> = {
  "spice-market": { category: "Living rooms", month: "Apr", title: <>The Spice <i>Market</i></> },
  "linen-bedroom": { category: "Bedrooms", month: "Mar", title: <>Linen <i>Bedroom</i></> },
  "bluestone-hall": { category: "Kitchens", month: "Feb", title: <>Bluestone <i>Hall</i></> },
  "pondicherry-sage": { category: "Bedrooms", month: "Feb", title: <>Pondicherry <i>Sage</i></> },
  "brass-veranda": { category: "Verandas", month: "Jan", title: <>Brass <i>Veranda</i></> },
  "oxblood-library": { category: "Living rooms", month: "Jan", title: <>Oxblood <i>Library</i></> },
  "midnight-indigo": { category: "Façades", month: "Dec", title: <>Midnight <i>Indigo</i></> },
  "ivory-drawing-room": { category: "Living rooms", month: "Dec", title: <>Ivory <i>Drawing Room</i></> },
  "walnut-study": { category: "Bedrooms", month: "Nov", title: <>Walnut <i>Study</i></> },
  "adobe-table": { category: "Kitchens", month: "Oct", title: <>Adobe <i>Table</i></> },
  "eucalypt-nursery": { category: "Bedrooms", month: "Sep", title: <>Eucalypt <i>Nursery</i></> },
  "minuit-bar": { category: "Commercial", month: "Aug", title: <>Minuit <i>Bar</i></> },
};

const PLATES: ReadonlyArray<Plate> = WORKS.map((w, i) => {
  const meta = PLATE_META[w.slug];
  return {
    slug: w.slug,
    num: String(i + 1).padStart(2, "0"),
    category: meta?.category ?? "Living rooms",
    title: meta?.title ?? w.title,
    code: `${w.code} · ${w.shadeName}`,
    swatch: w.swatch,
    location: w.location,
    date: meta ? `${meta.month} ${w.year}` : w.year,
    tag: w.category,
    tone: w.tone,
    aspect: w.aspect,
  };
});

export default function GalleryPage() {
  return (
    <>
      <Marquee items={["The Gallery", "Recoloured rooms · real catalogue shades · only the wall changes", "Curated quarterly"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Gallery</Eyebrow>
            <Mono>12 plates · curated quarterly</Mono>
          </div>
          <h1 className="display">A library of <i>finished rooms.</i></h1>
          <Lead className="page-lead">Twelve rooms from ten cities — Belgavi to Hyderabad — each recoloured from a single photograph with shades from the live catalogue. Only the wall changes.</Lead>
          <GalleryGrid plates={PLATES} />
        </header>

        <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "120px 0", marginTop: 80 }} className="full-bleed">
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <Placeholder tone="oxblood" grain corners tag="AT THE COUNTER" label="A paint counter, Belgavi" style={{ aspectRatio: "5 / 4" }} />
              <div>
                <Eyebrow>At the counter</Eyebrow>
                <h3 style={{ marginTop: 24, fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 1, letterSpacing: "-.015em", color: "var(--ivory)" }}>
                  From <i>let me think</i> <br />to <i>same afternoon.</i>
                </h3>
                <p style={{ font: "300 17px/1.55 var(--sans)", color: "var(--ivory-soft)", marginTop: 24 }}>
                  When the customer can see their own wall change colour, <i>let me think</i> becomes an order. That is the whole product.
                </p>
                <div className="r-cols-xs-1" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                  {[
                    ["20 s", "photo to first preview"],
                    ["10,000+", "shades, real codes intact"],
                    ["1 tap", "preview to WhatsApp"],
                  ].map(([num, lbl]) => (
                    <div key={lbl} style={{ borderTop: "1px solid var(--band-rule)", paddingTop: 18 }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 48, color: "var(--brass-soft)", lineHeight: 1 }}>{num}</div>
                      <div style={{ font: "400 15px/1.4 var(--serif)", color: "var(--ivory-soft)", marginTop: 8 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 48 }}>
                  <Link href="/method" className="text-link">See how it works &nbsp;→</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "160px 0" }}>
          <div className="reveal" style={{ maxWidth: 880, margin: "0 auto" }}>
            <Mono brass>Painted with HueVista?</Mono>
            <h2 className="display" style={{ fontSize: "clamp(48px, 8vw, 108px)", marginTop: 24, lineHeight: 0.92 }}>
              Submit a room <br /><i>to the gallery.</i>
            </h2>
            <Lead style={{ margin: "32px auto 0" }}>
              Retailers and customers alike. Paint a room with HueVista, keep the before and after, and we&apos;ll ask for it — we curate quarterly.
            </Lead>
            <div style={{ marginTop: 48, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Paint a room first — try it free <span className="arr">→</span></Link>
              <Link href="/work" className="btn btn-ghost">Browse our work <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
