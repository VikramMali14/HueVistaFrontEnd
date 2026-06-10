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
      <div className="reveal hv-method-head r-stack-md">
        <div>
          <Eyebrow>At the counter</Eyebrow>
          <h2 className="display hv-method-title">A photo in,<br /><i>a painted wall out.</i></h2>
        </div>
        <Lead className="hv-method-lead">No studio, no waiting. The customer&apos;s own photograph, their walls in any shade, ready to share — in seconds, at your counter.</Lead>
      </div>
      <div className="reveal d1 hv-method-grid r-cols-lg-3 r-cols-md-2 r-cols-sm-1">
        {STEPS.map((s) => (
          <div key={s.num} className="hv-method-card">
            <div className="hv-method-card-num">{s.num}</div>
            <div className="hv-method-card-tag">{s.tag}</div>
            <div className="hv-method-card-title">{s.title}</div>
            <p className="hv-method-card-body">{s.body}</p>
            <Placeholder tone={s.tone} grain corners tag={s.phaseTag} style={{ aspectRatio: "3 / 4", marginTop: 20 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
