import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { CompareSlider } from "./compare-slider";

const STATS = [
  { num: "20s", label: "From a photo of the room to a realistic preview — in about twenty seconds." },
  { num: "2,481", label: "Paint shades with their real codes, names and finishes, across the catalogues we support." },
  { num: "14 days", label: "Free trial. No card needed to start, cancel whenever you like." },
];

function StatCell({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="hv-hero-stat-num" style={{ fontFamily: "var(--serif)", fontWeight: 650, fontSize: 48, color: "var(--fg)", lineHeight: 1, letterSpacing: "-.03em" }}>{num}</div>
      <div className="hv-hero-stat-label" style={{ marginTop: 12, font: "400 16px/1.5 var(--sans)", color: "var(--fg-soft)", maxWidth: "32ch" }}>{label}</div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hv-hero" style={{ padding: "100px 0 80px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 56, flexWrap: "wrap", gap: 24 }}>
        <Eyebrow>See it before you paint it</Eyebrow>
        <Mono>Belgavi, India</Mono>
      </div>
      <h1 className="display reveal in hv-hero-title" style={{ fontSize: "clamp(64px, 11vw, 180px)", textAlign: "left" }}>
        See any colour
        <span style={{ display: "block" }}>on your walls.</span>
      </h1>
      <p className="lead reveal d1" style={{ marginTop: 32, maxWidth: "48ch" }}>
        Upload a photo of the room, pick a shade, and get a realistic preview in
        seconds. Built for paint shops, painters and homeowners.
      </p>
      <div className="reveal d1 hv-hero-stats r-cols-md-3 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56, marginTop: 64, paddingTop: 40, borderTop: "1px solid var(--rule)" }}>
        {STATS.map((m, i) => (
          <StatCell key={i} num={m.num} label={m.label} />
        ))}
      </div>
      <CompareSlider />
      <div className="reveal d3" style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <Mono>Drag to compare — a real photo, only the wall colour has changed</Mono>
      </div>
      <div className="reveal d4" style={{ marginTop: 56, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <LinkButton href="/trial" size="lg">Try it free <span className="arr">→</span></LinkButton>
        <LinkButton href="/method" size="lg" variant="ghost">How it works <span className="arr">→</span></LinkButton>
      </div>
    </section>
  );
}
