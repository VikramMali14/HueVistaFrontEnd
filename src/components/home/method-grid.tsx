import { Eyebrow, Lead } from "@/components/ui/eyebrow";

// The same six steps as /method, in six words each. "Mark the walls — AI segments
// each paintable surface" and "Recolour live — 60 fps" were written for someone who
// already knew the product; these are written for a shop owner reading the home page
// for the first time.
const STEPS = [
  { num: "I.", title: "Upload the photo", body: "From a phone, a tablet or WhatsApp." },
  { num: "II.", title: "Clean it up", body: "Wires, clutter and marks tidied away." },
  { num: "III.", title: "Find the walls", body: "Paintable walls picked out, one by one." },
  { num: "IV.", title: "Fix anything missed", body: "Click to add or remove a surface." },
  { num: "V.", title: "Paint it", body: "Colour changes; light and shadows stay." },
  { num: "VI.", title: "Send it back", body: "On WhatsApp, with the shade codes." },
];

export function MethodGrid() {
  return (
    <section id="method">
      <div className="reveal hv-method-head r-stack-md">
        <div>
          <Eyebrow>The method</Eyebrow>
          <h2 className="display hv-method-title">From a photograph,{" "}<br /><i>a painted wall.</i></h2>
        </div>
        <Lead className="hv-method-lead">No studio and no waiting. Your customer&apos;s own photo, their walls in any shade, ready to send — in seconds, at your counter.</Lead>
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
