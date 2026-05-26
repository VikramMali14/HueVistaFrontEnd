import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "The Method",
  description: "Five chapters, under twenty seconds. A photograph, a tap, a hue.",
};

const CHAPTERS = [
  { num: "I.", title: <>The <i>upload.</i></>, body: "A photograph from the customer's phone — pasted, dragged, or chosen. Claude Haiku Vision classifies it as indoor or outdoor in under a second, gently turning away selfies, food and landscapes.", tone: "ivory" as const, pairs: [["Format", "JPEG / PNG / WebP"], ["Maximum", "10 MB"], ["Classification", "Claude Haiku"], ["Storage", "S3 · ap-south-1"]] },
  { num: "II.", title: <>The <i>clean.</i></>, body: "Optional. Nano Banana Pro removes the wires, the parked vehicles, the debris, the hanging laundry that the camera caught and the customer did not see. The cleaned image is what the rest of the pipeline sees.", tone: "slate" as const, pairs: [["Model", "Nano Banana Pro"], ["Provider", "Replicate"], ["Latency", "6 — 10 s"], ["Optional", "Toggle in the room"]] },
  { num: "III.", title: <>The <i>auto-mask.</i></>, body: "Nano Banana returns one colour-coded mask — white for the main wall, green for the trim, blue for the accent wall. The server splits this into per-category binary masks: MAIN_WALL, ACCENT_WALL, TRIM.", tone: "sage" as const, pairs: [["Model", "Nano Banana · Gemini"], ["Output", "Single colour-coded mask"], ["Latency", "5 — 8 s"], ["Categories", "MAIN / ACCENT / TRIM"]] },
  { num: "IV.", title: <>The <i>refinement.</i></>, body: "Anything missed? Click a point. SAM 2 segments the surface at that click, and the resulting region is saved as MANUAL — the safety net for whatever the auto path misses.", tone: "brass" as const, pairs: [["Model", "SAM 2"], ["Prompt", "Point click"], ["Latency", "2 — 3 s"], ["Saved as", "MANUAL region"]] },
  { num: "V.", title: <>The <i>recolour.</i></>, body: "WebGL replaces only hue and saturation, preserving every shadow, every cornice, every grain. Sixty frames a second on mid-range mobile, with zero backend round-trip per swatch change.", tone: "terracotta" as const, pairs: [["Engine", "WebGL · GLSL"], ["Method", "Luminance-preserving"], ["FPS", "60 (mid-range mobile)"], ["Cost", "Zero per swatch"]] },
];

export default function MethodPage() {
  return (
    <>
      <Marquee items={["The Method", "From a customer's photograph to a photorealistic preview · under twenty seconds", "Five chapters · five technologies"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume II &nbsp;·&nbsp; The Method</Eyebrow>
            <Mono>Est. MMXXVI &nbsp;·&nbsp; Engineered in Belgavi</Mono>
          </div>
          <h1 className="display">Five chapters,<br /><i>under twenty seconds.</i></h1>
          <Lead className="page-lead">A photograph, a tap, a hue. The original light, the original shadow, the original cornice — preserved. We replace exactly one thing.</Lead>
        </header>
        {CHAPTERS.map((c, i) => (
          <article key={c.num} className="reveal" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 64, padding: "140px 0", borderTop: i === 0 ? "none" : "1px solid var(--rule)", alignItems: "start" }}>
            <span style={{ fontFamily: "var(--serif)", fontWeight: 300, fontStyle: "italic", fontSize: 56, lineHeight: 1, color: "var(--brass)" }}>{c.num}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(48px, 6vw, 84px)", lineHeight: .95, letterSpacing: "-.02em", color: "var(--ivory)", margin: 0 }}>{c.title}</h2>
              <Lead>{c.body}</Lead>
            </div>
            <div>
              <Placeholder tone={c.tone} grain corners tag={`CHAPTER ${c.num}`} style={{ aspectRatio: "4 / 5" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 12 }}>
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
      </main>
      <Footer />
    </>
  );
}
