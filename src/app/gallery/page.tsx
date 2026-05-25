import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Rooms in colour. Selected projects from pilot retailers.",
};

const PROJECTS = [
  { plate: "I", title: "The Belgavi Living Room", shade: "Terracotta · AP-1428", retailer: "Sharda Paints, Belgavi", tone: "terracotta" as const, span: 2 },
  { plate: "II", title: "A Madras Courtyard", shade: "Bone China · AP-N101", retailer: "Saravana Paints, Chennai", tone: "ivory" as const, span: 1 },
  { plate: "III", title: "The Pune Atelier", shade: "Sage Whisper · AP-7706", retailer: "Ashok Hardware, Pune", tone: "sage" as const, span: 1 },
  { plate: "IV", title: "A Hyderabad Bedroom", shade: "Oxblood · AP-3318", retailer: "Lakshmi Paints, Hyderabad", tone: "oxblood" as const, span: 2 },
  { plate: "V", title: "The Goa Verandah", shade: "Slate · AP-9904", retailer: "Sunshine Paints, Mapusa", tone: "slate" as const, span: 1 },
  { plate: "VI", title: "A Bengaluru Stairwell", shade: "Champagne · AP-2215", retailer: "Diamond Paints, Bengaluru", tone: "brass" as const, span: 1 },
  { plate: "VII", title: "The Cochin Hallway", shade: "Walnut · AP-3304", retailer: "Kerala Paints, Cochin", tone: "walnut" as const, span: 1 },
  { plate: "VIII", title: "A Mumbai Foyer", shade: "Indigo · AP-9912", retailer: "Bombay Paints, Dadar", tone: "indigo" as const, span: 2 },
];

export default function GalleryPage() {
  return (
    <>
      <Marquee items={["The Gallery", "Selected projects · pilot retailers", "Rooms in colour"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume V &nbsp;·&nbsp; The Gallery</Eyebrow>
            <Mono>{PROJECTS.length} plates · MMXXVI</Mono>
          </div>
          <h1 className="display">Rooms in <i>colour.</i></h1>
          <Lead className="page-lead">Selected projects from pilot retailers. Each plate is a real photograph from the counter — only the wall has changed.</Lead>
        </header>
        <section style={{ paddingTop: 80 }}>
          <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {PROJECTS.map((p) => (
              <article key={p.plate} style={{ gridColumn: `span ${p.span}` }}>
                <Placeholder tone={p.tone} grain corners tag={`PLATE ${p.plate}`} style={{ aspectRatio: p.span === 2 ? "16 / 9" : "4 / 5" }} />
                <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                  <div>
                    <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 26, color: "var(--ivory)" }}>{p.title}</span>
                    <div style={{ marginTop: 4 }}><Mono>{p.shade}</Mono></div>
                  </div>
                  <Mono>{p.retailer}</Mono>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
