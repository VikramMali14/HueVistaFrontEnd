// The same six steps as /method, in six words each. "Mark the walls — AI segments
// each paintable surface" and "Recolour live — 60 fps" were written for someone who
// already knew the product; these are written for a shop owner reading the home page
// for the first time.
const STEPS = [
  { n: 1, title: "Upload the photo", body: "From a phone, a tablet or WhatsApp." },
  { n: 2, title: "Clean it up", body: "Wires, clutter and marks tidied away." },
  { n: 3, title: "Find the walls", body: "Paintable walls picked out, one by one." },
  { n: 4, title: "Fix anything missed", body: "Click to add or remove a surface." },
  { n: 5, title: "Paint it", body: "Colour changes; light and shadows stay." },
  { n: 6, title: "Send it back", body: "On WhatsApp, with the shade codes." },
];

export function MethodGrid() {
  return (
    <section id="method" aria-labelledby="method-title">
      <div className="reveal hv-method-head r-stack-md">
        {/* Plain and specific, on one line. It used to be "From a photograph, /
            <i>a painted wall.</i>" — which is the same sentence shape, the same
            line break and the same italic second clause as the five headings that
            followed it. Said once it is a voice; said six times it is a template,
            and a visitor stops reading the headings at about the third. */}
        <h2 id="method-title" className="display hv-method-title">
          Six steps, about twenty seconds.
        </h2>
        <p className="hv-method-lead">
          No studio and no waiting. Your customer&apos;s own photo, their walls in any
          shade, ready to send — at your counter, while they are still standing at it.
        </p>
      </div>
      <div className="hv-method-grid r-cols-md-2 r-cols-sm-1">
        {STEPS.map((s, i) => (
          <div key={s.n} className={`hv-method-card reveal d${Math.min(i + 1, 5)}`}>
            {/* A number, not "I." through "VI.". Roman numerals on a six-item
                how-it-works grid are costume: they make a shop owner decode the
                order of the steps they are being asked to follow. */}
            <div className="hv-method-card-num">{s.n}</div>
            <h3 className="hv-method-card-title">{s.title}</h3>
            <p className="hv-method-card-body">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
