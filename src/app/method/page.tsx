import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "The Method",
  description: "Five chapters, under twenty seconds. A photograph, a tap, a hue.",
};

const CHAPTERS = [
  {
    num: "I.",
    eyebrow: "Upload · under one second",
    title: <>The <i>photograph.</i></>,
    body: "A picture from the customer's phone, dragged onto the counter tablet, or sent on WhatsApp. The first second, before the customer has put their phone down, Claude has already read it. Room type. Surface orientation. Lighting condition — afternoon western light, fluorescent kitchen, overcast veranda. Each becomes a parameter for the steps that follow.",
    tone: "ivory" as const,
    tag: "FIG. I · CLASSIFICATION",
    pairs: [["Model", "Claude · Haiku"], ["Latency", "‹ 900 ms"], ["Output", "Scene JSON"], ["Stored", "EXIF preserved"]],
  },
  {
    num: "II.",
    eyebrow: "Clean · optional · opt-in",
    title: <>The <i>frame.</i></>,
    body: "Most Indian homes are photographed mid-life. A power cable trailing the cornice. A scooter parked half in frame. A length of laundry, an inverter, a wire bundled at the corner. Optional. The retailer chooses. Nano Banana Pro removes the distractions — wires, debris, parked vehicles, laundry — and the customer sees the room they wish they had photographed.",
    tone: "slate" as const,
    tag: "FIG. II · CLEAN PASS",
    pairs: [["Model", "Nano Banana Pro"], ["Latency", "~ 8 s"], ["Cost", "Opt-in only"], ["Reversible", "Always"]],
  },
  {
    num: "III.",
    eyebrow: "Auto-mask · 5 to 10 seconds",
    title: <>The <i>mask.</i></>,
    body: "A photograph is a flat surface. We make it dimensional. Nano Banana returns a colour-coded mask of every paintable surface — main wall, accent wall, trim, ceiling, door frame. Each region is independently addressable. Different walls can hold different colours; the trim moves separately; the feature wall, alone.",
    tone: "sage" as const,
    tag: "FIG. III · SEGMENTATION",
    pairs: [["Model", "Nano Banana"], ["Latency", "5–10 s"], ["Regions", "Up to 12"], ["Editable", "Yes — chapter IV"]],
  },
  {
    num: "IV.",
    eyebrow: "Refinement · one click",
    title: <>The <i>refinement.</i></>,
    body: "Auto-masks are right most of the time. Not always. A pillar overlapping the wall. A picture frame catching the segmenter's eye. An unusual moulding the model has never met. One click is enough. SAM 2 isolates that exact surface and saves it as a manual region — permanent, recoverable, reusable across recolours.",
    tone: "brass" as const,
    tag: "FIG. IV · MANUAL REGION",
    pairs: [["Model", "SAM 2"], ["Input", "Point or box"], ["Latency", "‹ 500 ms"], ["Persistence", "Saved per scene"]],
  },
  {
    num: "V.",
    eyebrow: "Recolour · 60 frames a second",
    title: <>The <i>hue.</i></>,
    body: "The model never paints. The model never imagines. The pixel that was lit, remains lit; the pixel in shadow, remains in shadow. Only the chromaticity changes — and only inside the mask. A WebGL shader running on the customer's own browser. The customer can change shade while looking, while moving, while comparing. The render is the interface.",
    tone: "terracotta" as const,
    tag: "FIG. V · RECOLOUR",
    pairs: [["Engine", "WebGL · GLSL"], ["Frame rate", "60 fps"], ["Colour space", "CIELAB"], ["Fidelity", "ΔE ‹ 1.6"]],
  },
];

const STACK: ReadonlyArray<[string, string, string]> = [
  ["A.", "Claude · Haiku", "Scene classification. Room, surface, light. A first read, in under a second."],
  ["B.", "Nano Banana Pro", "Image cleaning. Wires, debris, vehicles, laundry — quietly removed."],
  ["C.", "Nano Banana", "Semantic segmentation. Up to twelve paintable regions per scene."],
  ["D.", "SAM 2", "Point-prompted refinement. Manual regions, saved per scene."],
  ["E.", "WebGL · GLSL shader", "Real-time recolour, in the customer's own browser. Sixty frames a second."],
];

export default function MethodPage() {
  return (
    <>
      <Marquee items={["The Method", "From a customer's photograph to a photorealistic preview · under twenty seconds", "Five chapters · five technologies"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume II &nbsp;·&nbsp; The Method</Eyebrow>
            <Mono>Est. MMXXVI &nbsp;·&nbsp; Engineered in Belgavi</Mono>
          </div>
          <h1 className="display">Five chapters,<br /><i>under twenty seconds.</i></h1>
          <Lead className="page-lead">A photograph leaves the customer's hand. Twenty seconds later, the same photograph returns — its walls in any of two thousand catalogued shades, every shadow exactly where it was. This is how.</Lead>
        </header>

        {CHAPTERS.map((c, i) => (
          <article key={c.num} className="reveal hv-method-chapter" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 64, padding: "140px 0", borderTop: i === 0 ? "none" : "1px solid var(--rule)", alignItems: "start" }}>
            <span style={{ fontFamily: "var(--serif)", fontWeight: 300, fontStyle: "italic", fontSize: 56, lineHeight: 1, color: "var(--brass)" }}>{c.num}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(48px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-.02em", color: "var(--ivory)", margin: 0 }}>{c.title}</h2>
              <Lead>{c.body}</Lead>
            </div>
            <div>
              <Placeholder tone={c.tone} grain corners tag={c.tag} style={{ aspectRatio: "4 / 5" }} />
              <div className="r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 12 }}>
                {c.pairs.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
                    <Mono>{k}</Mono>
                    <span style={{ font: "300 italic 22px/1.2 var(--serif)", color: "var(--ivory)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}

        <section style={{ background: "#0a0805", padding: "140px 0" }} className="full-bleed">
          <div className="reveal" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <Eyebrow>The Stack</Eyebrow>
            <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 108px)", margin: "24px 0 56px" }}>
              Five technologies, <i>one continuous render.</i>
            </h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {STACK.map(([lbl, ttl, dsc], i) => (
                <div key={lbl} className="hv-stack-row" style={{ display: "grid", gridTemplateColumns: "60px 320px 1fr", gap: 32, padding: "32px 0", borderTop: i === 0 ? "1px solid var(--rule-strong)" : "1px solid var(--rule)", alignItems: "baseline" }}>
                  <span style={{ font: "300 italic 22px/1 var(--serif)", color: "var(--brass)" }}>{lbl}</span>
                  <span style={{ font: "300 28px/1.1 var(--serif)", color: "var(--ivory)" }}>{ttl}</span>
                  <span style={{ font: "300 17px/1.5 var(--sans)", color: "var(--ivory-soft)" }}>{dsc}</span>
                </div>
              ))}
              <div style={{ borderBottom: "1px solid var(--rule-strong)" }} />
            </div>
          </div>
        </section>

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
