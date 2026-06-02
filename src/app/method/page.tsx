import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "How it works",
  description: "From a customer's photograph to a photorealistic preview — in seconds, at your counter.",
};

const CHAPTERS = [
  {
    num: "I.",
    eyebrow: "Upload",
    title: <>The <i>photograph.</i></>,
    body: "A picture from the customer's phone, dragged onto the counter tablet, or sent on WhatsApp. The room, its surfaces and its light — afternoon western light, a fluorescent kitchen, an overcast veranda — are read straight away, and everything that follows is shaped by that first read.",
    tone: "ivory" as const,
    tag: "FIG. I",
  },
  {
    num: "II.",
    eyebrow: "Clean · optional",
    title: <>The <i>frame.</i></>,
    body: "Most Indian homes are photographed mid-life. A power cable trailing the cornice. A scooter parked half in frame. A length of laundry, a wire bundled at the corner. Optional, and entirely the retailer's choice: the distractions are quietly removed, and the customer sees the room they wish they had photographed.",
    tone: "slate" as const,
    tag: "FIG. II",
  },
  {
    num: "III.",
    eyebrow: "The walls",
    title: <>The <i>walls.</i></>,
    body: "A photograph is a flat surface. We make it dimensional. Every paintable surface is picked out on its own — main wall, accent wall, trim, ceiling, door frame. Each is addressed separately: different walls can hold different colours; the trim moves on its own; the feature wall, alone.",
    tone: "sage" as const,
    tag: "FIG. III",
  },
  {
    num: "IV.",
    eyebrow: "Refine · one click",
    title: <>The <i>refinement.</i></>,
    body: "It is right most of the time. Not always. A pillar overlapping the wall. A picture frame. An unusual moulding. One click is enough to isolate that exact surface and keep it as a saved region — permanent, recoverable, and reusable across every recolour.",
    tone: "brass" as const,
    tag: "FIG. IV",
  },
  {
    num: "V.",
    eyebrow: "Recolour · live",
    title: <>The <i>hue.</i></>,
    body: "Nothing is ever repainted by a machine's imagination. The pixel that was lit, stays lit; the pixel in shadow, stays in shadow. Only the colour changes, and only inside the wall — live, in the customer's own browser, as they change shade while looking, while moving, while comparing.",
    tone: "terracotta" as const,
    tag: "FIG. V",
  },
];

export default function MethodPage() {
  return (
    <>
      <Marquee items={["How it works", "From a customer's photograph to a photorealistic preview · in seconds", "A photograph, a tap, a hue"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume II &nbsp;·&nbsp; How it works</Eyebrow>
            <Mono>Est. MMXXVI &nbsp;·&nbsp; Made in Belgavi</Mono>
          </div>
          <h1 className="display">From a photo,<br /><i>a painted wall.</i></h1>
          <Lead className="page-lead">A photograph leaves the customer's hand. Seconds later, the same photograph returns — its walls in any of two thousand catalogued shades, every shadow exactly where it was.</Lead>
        </header>

        {CHAPTERS.map((c, i) => (
          <article key={c.num} className="reveal hv-method-chapter" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 64, padding: "140px 0", borderTop: i === 0 ? "none" : "1px solid var(--rule)", alignItems: "start" }}>
            <span style={{ fontFamily: "var(--serif)", fontWeight: 300, fontStyle: "italic", fontSize: 56, lineHeight: 1, color: "var(--brass)" }}>{c.num}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(48px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-.02em", color: "var(--fg)", margin: 0 }}>{c.title}</h2>
              <Lead>{c.body}</Lead>
            </div>
            <div>
              <Placeholder tone={c.tone} grain corners tag={c.tag} style={{ aspectRatio: "4 / 5" }} />
            </div>
          </article>
        ))}

        <section style={{ textAlign: "center", padding: "200px 0", background: "radial-gradient(ellipse at 50% 50%, rgba(184,153,104,.10), transparent 65%)" }}>
          <div className="reveal">
            <Mono brass>Begin</Mono>
            <h2 className="display" style={{ fontSize: "clamp(60px, 10vw, 160px)", marginTop: 32, lineHeight: 0.92 }}>
              The colour, <i>at the counter.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Begin a trial <span className="arr">→</span></Link>
              <Link href="/gallery" className="btn btn-ghost">See it on real rooms <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
