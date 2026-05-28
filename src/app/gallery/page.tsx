import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";
import { GalleryGrid, type Plate } from "@/components/gallery/gallery-grid";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A library of finished rooms. Real photographs, only the wall has changed.",
};

const PLATES: ReadonlyArray<Plate> = [
  { num: "01", category: "Living rooms", title: <>The Spice <i>Market</i></>, code: "AP-1410 · Rust", swatch: "#9d5236", location: "Belgavi", date: "Apr · MMXXVI", tag: "PLATE I · LIVING ROOM", tone: "terracotta", aspect: "16 / 10" },
  { num: "02", category: "Bedrooms", title: <>Linen <i>Atelier</i></>, code: "AP-1923 · Bisque", swatch: "#cdb9a0", location: "Pune", date: "Mar · MMXXVI", tag: "PLATE II · BEDROOM", tone: "ivory", aspect: "4 / 5" },
  { num: "03", category: "Kitchens", title: <>Bluestone <i>Hall</i></>, code: "AP-1304", swatch: "#3e4a52", location: "Bengaluru", date: "Feb", tag: "PLATE III · KITCHEN", tone: "slate", aspect: "1 / 1" },
  { num: "04", category: "Bedrooms", title: <>Pondicherry <i>Sage</i></>, code: "AP-1611", swatch: "#5b6c5b", location: "Mangalore", date: "Feb · MMXXVI", tag: "PLATE IV · BEDROOM", tone: "sage", aspect: "1 / 1" },
  { num: "05", category: "Verandas", title: <>Brass <i>Veranda</i></>, code: "AP-1521", swatch: "#a47148", location: "Hubballi", date: "Jan", tag: "PLATE V · VERANDA", tone: "brass", aspect: "1 / 1" },
  { num: "06", category: "Living rooms", title: <>Oxblood <i>Library</i></>, code: "AP-1109 · Oxblood", swatch: "#7a3a2f", location: "Mysuru", date: "Jan · MMXXVI", tag: "PLATE VI · LIBRARY", tone: "oxblood", aspect: "4 / 5" },
  { num: "07", category: "Façades", title: <>Midnight <i>Indigo</i></>, code: "AP-1212", swatch: "#3a4870", location: "Mumbai", date: "Dec · MMXXV", tag: "PLATE VII · FAÇADE", tone: "indigo", aspect: "16 / 10" },
  { num: "08", category: "Living rooms", title: <>Ivory <i>Drawing Room</i></>, code: "AP-2001", swatch: "#ebe5d7", location: "Belgavi", date: "Dec", tag: "PLATE VIII · DRAWING ROOM", tone: "ivory", aspect: "1 / 1" },
  { num: "09", category: "Bedrooms", title: <>Walnut <i>Study</i></>, code: "AP-1718", swatch: "#7a5a3f", location: "Kolhapur", date: "Nov · MMXXV", tag: "PLATE IX · STUDY", tone: "walnut", aspect: "1 / 1" },
  { num: "10", category: "Kitchens", title: <>Adobe <i>Table</i></>, code: "AP-1418", swatch: "#c87a55", location: "Goa", date: "Oct", tag: "PLATE X · DINING", tone: "terracotta", aspect: "4 / 5" },
  { num: "11", category: "Bedrooms", title: <>Eucalypt <i>Nursery</i></>, code: "AP-1624", swatch: "#a9b8a4", location: "Bengaluru", date: "Sep", tag: "PLATE XI · NURSERY", tone: "sage", aspect: "4 / 5" },
  { num: "12", category: "Commercial", title: <>Minuit <i>Bar</i></>, code: "AP-0102", swatch: "#1c1814", location: "Hyderabad", date: "Aug · MMXXV", tag: "PLATE XII · BAR", tone: "ink", aspect: "4 / 5" },
];

export default function GalleryPage() {
  return (
    <>
      <Marquee items={["The Gallery", "Real photographs · real catalogue shades · only the wall has changed", "Selected from the pilot programme"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume III &nbsp;·&nbsp; The Gallery</Eyebrow>
            <Mono>XII plates · from the pilot</Mono>
          </div>
          <h1 className="display">A library of <i>finished rooms.</i></h1>
          <Lead className="page-lead">Twelve plates, drawn from the pilot programme across Belgavi, Bengaluru, Pune and Mangalore. Each room is a real photograph taken in a real home. Only the wall has changed.</Lead>
          <GalleryGrid plates={PLATES} />
        </header>

        <section style={{ background: "#0a0805", padding: "120px 0", marginTop: 80 }} className="full-bleed">
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <div className="reveal" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <Placeholder tone="oxblood" grain corners tag="CASE STUDY · NO. I" label="Sharda Paints, Belgavi" style={{ aspectRatio: "5 / 4" }} />
              <div>
                <Eyebrow>Case Study &nbsp;·&nbsp; No. I</Eyebrow>
                <h3 style={{ marginTop: 24, fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 1, letterSpacing: "-.015em", color: "var(--ivory)" }}>
                  From <i>let me think</i> <br />to <i>same afternoon.</i>
                </h3>
                <p style={{ font: "300 17px/1.55 var(--sans)", color: "var(--ivory-soft)", marginTop: 24 }}>
                  In the four months since the pilot began, walk-ins at Sharda Paints have moved from indecision to order at twice the previous rate.
                </p>
                <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                  {[
                    ["2×", "conversion at the counter"],
                    [<><i>‹</i>5%</>, "repaint requests, post-job"],
                    [<>XL<i>m</i></>, "avg time, photo to invoice"],
                  ].map(([num, lbl], idx) => (
                    <div key={idx} style={{ borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 48, color: "var(--brass-soft)", lineHeight: 1 }}>{num}</div>
                      <div style={{ font: "300 italic 15px/1.4 var(--serif)", color: "var(--ivory-soft)", marginTop: 8 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 48 }}>
                  <Link href="/journal" className="text-link">Read the full case study &nbsp;→</Link>
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
              Retailers and customers alike. A before, an after, the catalogue code. We curate quarterly.
            </Lead>
            <div style={{ marginTop: 48, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Submit a plate <span className="arr">→</span></Link>
              <Link href="/method" className="btn btn-ghost">Read the method <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
