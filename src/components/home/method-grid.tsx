import { Eyebrow, Lead } from "@/components/ui/eyebrow";

const STEPS = [
  { num: "I.", tag: "Upload", title: "The photograph", body: "A photo from the customer's phone. Drag it in, or send it on WhatsApp." },
  { num: "II.", tag: "Detect", title: "The walls", body: "Every wall, trim and ceiling is picked out for you — each one ready to recolour on its own." },
  { num: "III.", tag: "Recolour", title: "The hue", body: "Pick a shade. The wall changes at once — every shadow and texture left exactly where it was." },
  { num: "IV.", tag: "Compare", title: "Before & after", body: "Drag to reveal the room before and after, side by side, in the very same light." },
  { num: "V.", tag: "Share", title: "On WhatsApp", body: "Send the finished preview as a link or an image — one tap, straight to the customer." },
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
      <div className="hv-method-grid r-cols-lg-3 r-cols-md-2 r-cols-sm-1">
        {STEPS.map((s, i) => (
          <div key={s.num} className={`hv-method-card reveal d${Math.min(i + 1, 5)}`}>
            <div className="hv-method-card-num">{s.num}</div>
            <div className="hv-method-card-tag">{s.tag}</div>
            <div className="hv-method-card-title">{s.title}</div>
            <p className="hv-method-card-body">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
