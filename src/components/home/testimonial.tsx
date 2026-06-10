import { Mono } from "@/components/ui/eyebrow";

export function Testimonial() {
  return (
    <section style={{ textAlign: "center" }}>
      <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, maxWidth: 880, margin: "0 auto" }}>
        <Mono>What retailers say</Mono>
        
        <blockquote style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(30px, 4vw, 56px)", lineHeight: 1.15, letterSpacing: "-.03em", color: "var(--fg)", maxWidth: "22ch", margin: 0 }}>
          “Earlier I would lose two of every five walk-ins to <i>let me think</i>. Now they pick the colour at the counter — and place the order the same afternoon.”
        </blockquote>
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, var(--brass) 0%, var(--brass-deep) 100%)", border: "1px solid var(--rule-brass)", marginBottom: 6 }} aria-hidden />
          <span style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 18, color: "var(--fg)" }}>Suresh K.</span>
          <Mono>Sharda Paints, Belgavi · AP dealer</Mono>
        </div>
      </div>
    </section>
  );
}
