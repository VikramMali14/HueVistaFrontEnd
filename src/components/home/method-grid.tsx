import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";

const STEPS = [
  { num: "I.", tag: "Upload", title: "The photograph", body: "A photo from the customer's phone. Drag it in, or send it on WhatsApp.", tone: "ivory" as const, phaseTag: "STEP 01" },
  { num: "II.", tag: "Detect", title: "The walls", body: "Every wall, trim and ceiling is picked out for you — each one ready to recolour on its own.", tone: "sage" as const, phaseTag: "STEP 02" },
  { num: "III.", tag: "Recolour", title: "The hue", body: "Pick a shade. The wall changes at once — every shadow and texture left exactly where it was.", tone: "terracotta" as const, phaseTag: "STEP 03" },
  { num: "IV.", tag: "Compare", title: "Before & after", body: "Drag to reveal the room before and after, side by side, in the very same light.", tone: "slate" as const, phaseTag: "STEP 04" },
  { num: "V.", tag: "Share", title: "On WhatsApp", body: "Send the finished preview as a link or an image — one tap, straight to the customer.", tone: "brass" as const, phaseTag: "STEP 05" },
];

export function MethodGrid() {
  return (
    <section id="method">
      <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 48, alignItems: "end", marginBottom: 80 }}>
                <div>
          <Eyebrow>At the counter</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 108px)", marginTop: 24 }}>A photo in,<br /><i>a painted wall out.</i></h2>
        </div>
        <Lead style={{ textAlign: "right" }}>No studio, no waiting. The customer's own photograph, their walls in any shade, ready to share — in seconds, at your counter.</Lead>
      </div>
      <div className="reveal d1 r-cols-lg-3 r-cols-md-2 r-cols-sm-1" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--rule)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
        {STEPS.map((s) => (
          <div key={s.num} style={{ background: "var(--charcoal)", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ font: "400 22px/1 var(--serif)", color: "var(--brass)" }}>{s.num}</div>
            <div style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--mute)" }}>{s.tag}</div>
            <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 32, lineHeight: 1, color: "var(--ivory)", marginTop: 8 }}>{s.title}</div>
            <Placeholder tone={s.tone} grain corners tag={s.phaseTag} label={s.body} style={{ aspectRatio: "3 / 4", marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
