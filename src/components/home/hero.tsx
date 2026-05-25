import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { CompareSlider } from "./compare-slider";

const META = [
  { num: <>XX<i>s</i></>, label: "From a customer's photograph to a photorealistic preview — under twenty seconds." },
  { num: <>2,481</>, label: "Catalogued shades. Codes, names, finishes — intact, across every catalogue we partner with." },
  { num: <>ΔE&nbsp;<i>&lt;</i>&nbsp;1.6</>, label: "Colour fidelity, measured. Not approximated by the model — measured against the can." },
];

export function Hero() {
  return (
    <section style={{ padding: "100px 0 80px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 64, flexWrap: "wrap", gap: 24 }}>
        <Eyebrow>Volume I &nbsp;·&nbsp; Chapter One</Eyebrow>
        <Mono>Est. MMXXVI &nbsp;·&nbsp; Belgavi, IN</Mono>
      </div>
      <h1 className="display reveal in" style={{ fontSize: "clamp(72px, 13vw, 220px)", textAlign: "left", letterSpacing: "-.03em", lineHeight: 0.9 }}>
        See the wall
        <span style={{ display: "block", paddingLeft: "1.4em" }}>
          <i>before</i> the paint.
        </span>
      </h1>
      <div className="reveal d1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64, marginTop: 72, paddingTop: 40, borderTop: "1px solid var(--rule)" }}>
        {META.map((m, i) => (
          <div key={i}>
            <div style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 56, color: "var(--brass-soft)", lineHeight: 1, letterSpacing: "-.02em" }}>{m.num}</div>
            <div style={{ marginTop: 14, font: "300 italic 18px/1.4 var(--serif)", color: "var(--ivory-soft)", maxWidth: "32ch" }}>{m.label}</div>
          </div>
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
