import { Eyebrow, Mono } from "@/components/ui/eyebrow";

const CARDS = [
  { num: "I", name: "Terracotta", code: "AP-1428", hex: "#b96b48" },
  { num: "II", name: "Sage Whisper", code: "AP-7706", hex: "#7b8a72" },
  { num: "III", name: "Bone China", code: "AP-N101", hex: "#ebe5d7" },
  { num: "IV", name: "Oxblood", code: "AP-3318", hex: "#7a3a2f" },
  { num: "V", name: "Slate", code: "AP-9904", hex: "#3e4a52" },
  { num: "VI", name: "Saffron", code: "AP-2208", hex: "#c9a17a" },
  { num: "VII", name: "Walnut", code: "AP-3304", hex: "#5a4030" },
  { num: "VIII", name: "Champagne", code: "AP-2215", hex: "#dac1a3" },
];

export function PaintedWith() {
  return (
    <section id="painted-with" style={{ padding: "160px 0", overflow: "hidden" }}>
      <div className="reveal" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
        <div>
          <Eyebrow><span className="roman">vi · </span>painted with</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 84px)", marginTop: 24 }}>Picked at the counter,<br /><i>finished on the wall.</i></h2>
        </div>
        <Mono>← drag</Mono>
      </div>
      <div className="reveal d1" style={{ display: "flex", gap: 24, marginTop: 80, overflowX: "auto", padding: "60px 0 80px", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
        {CARDS.map((c) => (
          <div key={c.num} style={{ flex: "0 0 320px", scrollSnapAlign: "start" }}>
            <div style={{ height: 440, position: "relative", background: c.hex, boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 40px 80px -30px rgba(0,0,0,.6), 0 12px 30px -12px rgba(0,0,0,.4)" }}>
              <span className="hv-ornament" style={{ position: "absolute", top: 22, right: 22, font: "400 italic 18px/1 var(--serif)", color: "rgba(255,255,255,.7)" }}>{c.num}</span>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,.16), transparent 35%, transparent 70%, rgba(0,0,0,.18))", pointerEvents: "none" }} />
            </div>
            <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)" }}>{c.name}</span>
              <Mono>{c.code}</Mono>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
