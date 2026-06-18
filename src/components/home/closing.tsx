import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";

export function Closing() {
  return (
    <section style={{ textAlign: "center", padding: "200px 0", background: "radial-gradient(ellipse at 50% 50%, rgba(184,153,104,.10), transparent 65%)" }}>
      <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        
        <Mono brass>Begin</Mono>
        <h2 className="display" style={{ fontSize: "clamp(44px, 11vw, 180px)", lineHeight: 0.9, margin: 0, textAlign: "center" }}>Sell the colour<br /><i>before the can opens.</i></h2>
        <div style={{ marginTop: 24, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <LinkButton href="/trial" variant="brass" size="lg">Try it free <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" variant="ghost" size="lg">See how it works <span className="arr">→</span></LinkButton>
        </div>
        <Mono>fourteen days · no card · cancel quietly</Mono>
      </div>
    </section>
  );
}
