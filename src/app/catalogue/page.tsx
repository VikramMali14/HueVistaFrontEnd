import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { SHADES } from "@/lib/shades";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Every shade. Codes intact. Filter by family, finish, LRV.",
};

const FAMILIES = ["All", "Whites", "Neutrals", "Earths", "Reds", "Greens", "Blues", "Yellows", "Greys", "Browns"];

export default function CataloguePage() {
  return (
    <>
      <Marquee items={["The Catalogue", "Asian Paints · 248 shades", "Berger · Nerolac to follow"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume III &nbsp;·&nbsp; The Catalogue</Eyebrow>
            <Mono>{SHADES.length} shades · Asian Paints</Mono>
          </div>
          <h1 className="display">Every shade.<br /><i>Codes intact.</i></h1>
          <Lead className="page-lead">Filter by family, finish, LRV, regional style. Search by code, name or hex. Find what looks closest across brands by colour science — not by approximation.</Lead>
        </header>

        <section style={{ paddingTop: 80 }}>
          <div className="reveal" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", border: "1px solid var(--rule)", background: "var(--charcoal-soft)" }}>
            <div style={{ padding: "18px 20px", borderRight: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
              <Mono brass style={{ marginRight: 8 }}>⌕</Mono>
              <input placeholder="shade, code, or hex…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ivory)", font: "300 italic 16px/1 var(--serif)" }} />
            </div>
            {[["Family", "All"], ["Finish", "Any"], ["LRV", "0 — 100"], ["Style", "Indian"]].map(([l, v]) => (
              <div key={l} style={{ padding: "18px 20px", borderRight: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "space-between", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "var(--ivory-soft)", cursor: "pointer" }}>
                <span>{l}</span>
                <span style={{ color: "var(--brass)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, letterSpacing: ".01em", textTransform: "none" }}>{v}</span>
                <span style={{ color: "var(--mute)", fontSize: 10 }}>▾</span>
              </div>
            ))}
            <div style={{ padding: "18px 20px", display: "flex", alignItems: "center" }}><Mono>Clear all</Mono></div>
          </div>

          <div className="reveal d1" style={{ marginTop: 40, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
            <Mono>Showing {SHADES.length} of {SHADES.length}</Mono>
            <div style={{ display: "flex", gap: 4 }}>
              {FAMILIES.map((f, i) => (
                <span key={f} style={{ padding: "8px 14px", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", border: "1px solid " + (i === 0 ? "var(--ivory)" : "var(--rule)"), color: i === 0 ? "var(--ivory)" : "var(--mute)", cursor: "pointer" }}>{f}</span>
              ))}
            </div>
          </div>

          <div className="reveal d2" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24 }}>
            {SHADES.map((s) => (
              <article key={s.code} style={{ cursor: "pointer" }}>
                <div style={{ aspectRatio: "1 / 1.1", position: "relative", background: s.hex, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 20px 40px -20px rgba(0,0,0,.6)" }}>
                  <span style={{ position: "absolute", top: 14, right: 14, font: "400 italic 14px/1 var(--serif)", color: "rgba(255,255,255,.7)" }}>{s.code.split("-")[1]}</span>
                  <span style={{ position: "absolute", bottom: 14, left: 14, font: "400 9px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "rgba(255,255,255,.6)" }}>LRV {s.lrv}</span>
                </div>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ivory)", lineHeight: 1.05 }}>{s.name}</span>
                  <Mono>{s.code} · {s.family}</Mono>
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
