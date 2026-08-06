import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";
import { CompareSlider } from "./compare-slider";

export function Hero() {
  return (
    <section className="hv-hero2 full-bleed">
      {/* Cinematic background. The gradient + grain reads as a warm-lit room and
          needs no asset. To use a real photo or video instead, drop the file in
          /public and uncomment ONE of the blocks below — it layers under the scrim.
          <video className="hv-hero2-media" autoPlay muted loop playsInline poster="/hero.jpg">
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <img className="hv-hero2-media" src="/hero.jpg" alt="" aria-hidden /> */}
      <div className="hv-hero2-bg" aria-hidden />

      <div className="hv-hero2-inner">
        <p className="mono hv-rise" style={{ font: "500 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--hero-ink-mute)", margin: 0, display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-block", width: 18, height: 1, background: "var(--accent)", flexShrink: 0 }} aria-hidden />
          Paint visualiser · Indian counters
        </p>
        <h1 className="display hv-hero2-title hv-rise">
          {/* The space is explicit: JSX drops the newline between a text node and the
              next element, so without it the heading's real text content — what a
              screen reader reads, what a search engine indexes, what a copy-paste
              produces — was "See any paint colouron your walls." */}
          See any paint colour{" "}
          {/* Weight, not lightness — a pale second half reads as disabled text
              rather than as emphasis, and it has to invert with the theme. */}
          <span style={{ color: "var(--hero-ink-soft)", fontWeight: 400 }}>on your walls.</span>
        </h1>
        <p className="hv-hero2-sub reveal" style={{ maxWidth: "46ch" }}>Upload a photo of a room and see any paint colour on the walls in seconds. Made for paint shops and their customers.</p>
        <div className="hv-hero2-cta reveal d1">
          <LinkButton href="/trial" size="lg">Get started <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" size="lg" variant="ghost">How it works <span className="arr">→</span></LinkButton>
        </div>
      </div>

      <figure className="hv-hero2-demo reveal d2">
        <CompareSlider />
        <figcaption>
          <Mono>Drag to compare — same room, same light, only the wall colour changed</Mono>
        </figcaption>
      </figure>
    </section>
  );
}
