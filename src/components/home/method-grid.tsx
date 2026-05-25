import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";

const STEPS = [
  { num: "I.", tag: "Upload", title: "The photograph", body: "A photograph from the customer's phone. Claude classifies it in under a second.", tone: "ivory" as const, phaseTag: "PHASE 01 · CLASSIFY" },
  { num: "II.", tag: "Clean", title: "The frame", body: "Optional. Nano Banana Pro removes wires, parked vehicles, debris and laundry from the frame.", tone: "slate" as const, phaseTag: "PHASE 02 · CLEAN" },
  { num: "III.", tag: "Auto-mask", title: "The walls", body: "Nano Banana returns one colour-coded mask — main wall, accent wall, trim. Five to ten seconds.", tone: "sage" as const, phaseTag: "PHASE 03 · SEGMENT" },
  { num: "IV.", tag: "Refine", title: "The detail", body: "Anything missed? Click a point. SAM 2 segments that exact surface and saves it as a manual region.", tone: "brass" as const, phaseTag: "PHASE 04 · REFINE" },
  { num: "V.", tag: "Recolour", title: "The hue", body: "WebGL replaces only hue and saturation, preserving every shadow. Sixty frames a second.", tone: "terracotta" as const, phaseTag: "PHASE 05 · RENDER" },
];

export function MethodGrid() {
  return (
    <section id="method">
      <div className="reveal" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 48, alignItems: "end", marginBottom: 80 }}>
        <span className="roman" style={{ fontSize: 24 }}>II.</span>
        <div>
          <Eyebrow>The Method</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 108px)", marginTop: 24 }}>Five chapters,<br /><i>under twenty seconds.</i></h2>
        </div>
        <Lead style={{ textAlign: "right" }}>Engineered for the counter — not the consumer. A photograph, a tap, a hue. The original light, the original shadow, the original cornice — preserved.</Lead>
      </div>
      <div className="reveal d1" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--rule)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
        {STEPS.map((s) => (
          <div key={s.num} style={{ background: "var(--charcoal)", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ font: "300 italic 22px/1 var(--serif)", color: "var(--brass)" }}>{s.num}</div>
            <div style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--mute)" }}>{s.tag}</div>
            <div style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 32, lineHeight: 1, color: "var(--ivory)", marginTop: 8 }}>{s.title}</div>
            <Placeholder tone={s.tone} grain corners tag={s.phaseTag} label={s.body} style={{ aspectRatio: "3 / 4", marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
