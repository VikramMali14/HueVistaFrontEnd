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
        <p className="mono hv-rise" style={{ font: "500 11px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "rgba(247,247,245,.55)", margin: 0 }}>
          For paint retailers — sell colour at the counter
        </p>
        <h1 className="display hv-hero2-title hv-rise">
          See any colour
          <span>on your walls.</span>
        </h1>
        <div className="hv-hero2-cta reveal d1">
          <LinkButton href="/trial" size="lg">Get started <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" size="lg" variant="ghost">How it works <span className="arr">→</span></LinkButton>
        </div>
        <p className="hv-hero2-sub reveal d2">Built for paint counters. Start free — no card needed.</p>
      </div>

      <figure className="hv-hero2-demo reveal d2">
        <CompareSlider />
        <figcaption>
          <Mono>Drag to compare — the same room, the same light, only the wall colour changed</Mono>
        </figcaption>
      </figure>
    </section>
  );
}
