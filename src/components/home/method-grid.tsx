import { Eyebrow, Lead } from "@/components/ui/eyebrow";

const STEPS = [
  { num: "I.", title: "Upload the photo", body: "Customer's phone, tablet or WhatsApp." },
  { num: "II.", title: "Clean the frame", body: "Remove cables, clutter — optional." },
  { num: "III.", title: "Mark the walls", body: "AI segments each paintable surface." },
  { num: "IV.", title: "Refine the mask", body: "One click to fix pillars, frames." },
  { num: "V.", title: "Recolour live", body: "60 fps · shadows stay · live." },
  { num: "VI.", title: "Hand back", body: "WhatsApp it with the shade codes." },
];

export function MethodGrid() {
  return (
    <section id="method">
      <div className="reveal hv-method-head r-stack-md">
        <div>
          <Eyebrow>The method</Eyebrow>
          <h2 className="display hv-method-title">From a photograph,<br /><i>a painted wall.</i></h2>
        </div>
        <Lead className="hv-method-lead">No studio, no waiting. The customer&apos;s own photograph, their walls in any shade, ready to share — in seconds, at your counter.</Lead>
      </div>
      <div className="hv-method-grid r-cols-md-2 r-cols-sm-1">
        {STEPS.map((s, i) => (
          <div key={s.num} className={`hv-method-card reveal d${Math.min(i + 1, 5)}`}>
            <div className="hv-method-card-num">{s.num}</div>
            <div className="hv-method-card-title">{s.title}</div>
            <p className="hv-method-card-body">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
