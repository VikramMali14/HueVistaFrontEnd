import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { CompareSlider } from "./compare-slider";

// Premium shows three editorial stats. Classic shows a simpler pair — the
// catalogue size and the free trial — with the speed/ΔE figures dropped. Both
// are rendered; CSS swaps which one is visible per `data-variant`.
const PREMIUM_META = [
  { num: <>XX<i>s</i></>, label: "From a customer's photograph to a photorealistic preview — under twenty seconds." },
  { num: <>2,481</>, label: "Catalogued shades. Codes, names, finishes — intact, across every catalogue we support." },
  { num: <>ΔE&nbsp;<i>&lt;</i>&nbsp;1.6</>, label: "Colour fidelity, measured. Not approximated by the model — measured against the can." },
];

const CLASSIC_META = [
  { num: <>2,481</>, label: "Catalogued shades — codes, names and finishes kept intact." },
  { num: <>14 days</>, label: "Free trial. No card to begin, cancel whenever you like." },
];

function StatCell({ num, label }: { num: ReactNode; label: string }) {
  return (
    <div>
      <div className="hv-hero-stat-num" style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 56, color: "var(--accent)", lineHeight: 1, letterSpacing: "-.02em" }}>{num}</div>
      <div className="hv-hero-stat-label" style={{ marginTop: 14, font: "300 italic 18px/1.4 var(--serif)", color: "var(--fg-soft)", maxWidth: "32ch" }}>{label}</div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hv-hero" style={{ padding: "100px 0 80px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 64, flexWrap: "wrap", gap: 24 }}>
        <Eyebrow><span className="roman">Volume I &nbsp;·&nbsp; Chapter One</span><span className="hv-classic-eyebrow">See it before you sell it</span></Eyebrow>
        <Mono>Est. MMXXVI &nbsp;·&nbsp; Belgavi, IN</Mono>
      </div>
      <h1 className="display reveal in hv-hero-title" style={{ fontSize: "clamp(72px, 13vw, 220px)", textAlign: "left", letterSpacing: "-.03em", lineHeight: 0.9 }}>
        See the wall
        <span style={{ display: "block", paddingLeft: "1.4em" }}>
          <i>before</i> the paint.
        </span>
      </h1>
      <div className="reveal d1 hv-hero-stats hv-hero-stats-premium r-cols-md-3 r-cols-sm-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64, marginTop: 72, paddingTop: 40, borderTop: "1px solid var(--rule)" }}>
        {PREMIUM_META.map((m, i) => (
          <StatCell key={i} num={m.num} label={m.label} />
        ))}
      </div>
      <div className="reveal d1 hv-hero-stats hv-hero-stats-classic r-cols-sm-1" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 48, marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--rule)" }}>
        {CLASSIC_META.map((m, i) => (
          <StatCell key={i} num={m.num} label={m.label} />
        ))}
      </div>
      <CompareSlider />
      <div className="reveal d3" style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <Mono>Drag to reveal · A real photograph. Only the wall has changed.</Mono>
        <span className="roman">No. I · The Living Room</span>
      </div>
      <div className="reveal d4" style={{ marginTop: 64, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <LinkButton href="/trial" size="lg">Begin a trial <span className="arr">→</span></LinkButton>
        <LinkButton href="/method" size="lg" variant="ghost">Read the method <span className="arr">→</span></LinkButton>
      </div>
    </section>
  );
}
