import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "Journal",
  description: "Notes from the counter. Essays on colour, retail and the trade.",
};

const ENTRIES = [
  { num: "i", date: "May · MMXXVI", title: "On the counter, and the colour", excerpt: "How a two-centimetre swatch becomes a twelve-foot wall — and the small theatre that decides whether the sale closes.", tone: "terracotta" as const },
  { num: "ii", date: "April · MMXXVI", title: "Against the generative imagination", excerpt: "Why we replace exactly one thing: the hue. And why the sofa stays where it was.", tone: "slate" as const },
  { num: "iii", date: "April · MMXXVI", title: "ΔE, and the meaning of close enough", excerpt: "A short essay on colour difference, and why CIELAB is the only measure that matches the eye.", tone: "sage" as const },
  { num: "iv", date: "March · MMXXVI", title: "Belgavi, paint, and patience", excerpt: "On founding HueVista in a town that knows the trade well — and what we learned from twelve dealers.", tone: "walnut" as const },
];

export default function JournalPage() {
  return (
    <>
      <Marquee items={["The Journal", "Notes from the counter", "Essays on colour, retail and the trade"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume VII &nbsp;·&nbsp; The Journal</Eyebrow>
            <Mono>{ENTRIES.length} essays · MMXXVI</Mono>
          </div>
          <h1 className="display">Notes from <i>the counter.</i></h1>
          <Lead className="page-lead">Essays on colour, retail and the trade. Written from the room where the work happens.</Lead>
        </header>
        <section style={{ paddingTop: 80 }}>
          <div className="reveal">
            {ENTRIES.map((e, i) => (
              <Link key={e.num} href="/journal" style={{ display: "grid", gridTemplateColumns: "80px 1.2fr 2fr 200px", gap: 40, padding: "48px 0", borderTop: "1px solid var(--rule)", borderBottom: i === ENTRIES.length - 1 ? "1px solid var(--rule)" : "none", alignItems: "center", cursor: "pointer" }}>
                <span style={{ font: "400 italic 24px/1 var(--serif)", color: "var(--brass)" }}>{e.num}.</span>
                <div>
                  <Mono>{e.date}</Mono>
                  <h2 style={{ marginTop: 8, fontFamily: "var(--serif)", fontWeight: 300, fontSize: 36, lineHeight: 1.1, color: "var(--ivory)" }}>{e.title}</h2>
                </div>
                <p style={{ font: "300 italic 19px/1.5 var(--serif)", color: "var(--ivory-soft)", maxWidth: "44ch", margin: 0 }}>{e.excerpt}</p>
                <Placeholder tone={e.tone} grain style={{ aspectRatio: "4 / 3" }} />
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
